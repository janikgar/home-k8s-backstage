import {exec, execSync} from "node:child_process"
import * as fs from "node:fs"
import * as semver from "semver"

const DOCKER_BINARY = "podman"
const TRIVY_COMMAND = `${DOCKER_BINARY} run -v trivy:/cache -v $PWD:/repo aquasec/trivy repository --cache-dir /cache`

class Package {
    packageName: string;
    packageVersion: semver.SemVer;
    patchCandidates: semver.SemVer[];
    closestCandidate: semver.SemVer;
    closestCandidateDiff: semver.ReleaseType;

    constructor(currentPackage: string, patchCandidates: string[]){
        let pkgVersionString: string;
        [this.packageName, pkgVersionString] = currentPackage.split("@");
        this.packageVersion = semver.parse(pkgVersionString)!;

        let patchSet = new Set<semver.SemVer>();
        for (let patchCandidate of patchCandidates) {
            patchSet.add(semver.parse(patchCandidate)!);
        }

        let dedupedCandidates = new Array(...patchSet).sort();
        let diffedCandidates = dedupedCandidates.filter((v) => {
            return semver.lt(currentPackage, v)
        }).sort();

        console.log(diffedCandidates);

        this.patchCandidates = diffedCandidates;
        this.closestCandidate = this.patchCandidates[0];
        this.closestCandidateDiff = semver.diff(this.packageName, this.closestCandidate)!;
    }

    /**
     * merge
     */
    public merge(currentVersion: string, patchCandidates: string[]) {
        this.packageName = currentVersion;
        let patchSet = new Set<semver.SemVer>(this.patchCandidates);
        patchCandidates.map((patchCandidate) => {patchSet.add(semver.parse(patchCandidate)!)});
        this.patchCandidates = semver.sort(new Array(...patchSet).sort());
    }
}

// Run a command line command and return the output
function runCommand(command: string, logOutput?: boolean): string {
    let output = "";
    try {
        output = execSync(command, { encoding: "utf-8" });
    } catch (errorOutput: any) {
        throw(errorOutput);
    }
    if (logOutput) {
        console.log(logOutput);
    }
    return output
}

function readTrivyResults(fileName: string): object {
    let resultContent = fs.readFileSync(fileName).toString();
    return JSON.parse(resultContent);
}

function parseTrivyResults(results: any): Map<string, Package> {
    let importantResults = new Map<string, Package>();

    for (let result of results['Results'][0]['Vulnerabilities']) {
        let currentVersion = result['InstalledVersion'];
        let fixedVersions = result['FixedVersion'].split(",") as string[];

        fixedVersions = fixedVersions.map((value) => value.trim());

        if (importantResults.has(result['PkgID'])) {
            importantResults.get(result['PkgID'])?.merge(currentVersion, fixedVersions);
        } else {
            let newPackage = new Package(currentVersion, fixedVersions);
            importantResults.set(result['PkgID'], newPackage);
        }
    }
    return importantResults
}

function prettyPrintResults(parsedResults: Map<string, Package>) {
    for (let [pkgName, pkgList] of parsedResults) {
        let curVer = pkgList.packageName;
        let bestCandidate = pkgList.closestCandidate;
        let semverDiff = pkgList.closestCandidateDiff;
        console.log(`${pkgName}: ${curVer} -> ${bestCandidate}: (${semverDiff})`);
    }
}

function doPatches(parsedResults: Map<string, Package>, stage?: string) {
    console.log(`===== Beginning ${stage + " "}updates =====`)
    prettyPrintResults(parsedResults);
    if (parsedResults.size > 0) {
        for (let [pkgName, contents] of parsedResults) {
            attemptUpdate(pkgName, contents.closestCandidate);
        }

        console.log("--- Running yarn install");
        let yarnOutput = runCommand("yarn install");
        console.log(yarnOutput);

        console.log("--- Running integration tests");
        let e2eOutput = runCommand("yarn run test:e2e");
        console.log(e2eOutput);
    } else {
        console.log("--- Nothing to patch!")
    }
}

function getPatchStages(parsedResults: Map<string, Package>): Map<string, Package>[] {
    let smallChanges = new Map<string, Package>();
    let mediumChanges = new Map<string, Package>();
    let largeChanges = new Map<string, Package>();

    parsedResults.forEach((pkgDetails, pkgName) => {
        switch (pkgDetails.closestCandidateDiff) {
            case "patch":
                smallChanges.set(pkgName, pkgDetails);
                break;
            case "minor":
                mediumChanges.set(pkgName, pkgDetails);
                break;
            default:
                largeChanges.set(pkgName, pkgDetails);
        }
    });

    return [smallChanges, mediumChanges, largeChanges]
}

function runPatchStages(changeStages: Map<string, Package>[]){
    // batch all patch-level changes together
    doPatches(changeStages[0], "patch");
    doPatches(changeStages[1], "minor");
    for (let [pkgName, pkgDetails] of changeStages[2]) {
        let thisPkg = new Map<string, Package>();
        thisPkg.set(pkgName, pkgDetails)
        doPatches(thisPkg, `major: ${pkgName}`);
    }

    console.log("===== Deduping yarn packages =====");
    let dedupeOutput = execSync("yarn dedupe", {encoding: "utf-8"});
    console.log(dedupeOutput);

    console.log("===== Bumping version =====");
    let bumpOutput = execSync("yarn version patch", {encoding: "utf-8"});
    console.log(bumpOutput);

    let currentBranch = runCommand("git rev-parse --abbrev-ref HEAD");
    
    if (currentBranch !== "main") {
        console.log("===== Creating new branch =====");
        let versionOutput = runCommand("jq -r .version package.json", true);
        let sanitizedVersion = semver.parse(versionOutput);
        runCommand(`git checkout -b backstage-${sanitizedVersion}`, true);
    }
    console.log("===== Staging changes =====");
    runCommand("git commit -a -m 'automated patches'", true);
    runCommand("git push", true);
}

function attemptUpdate(pkgName: string, version: semver.SemVer) {
    let pkgContents = fs.readFileSync("./package.json").toString();
    let pkgJSON = JSON.parse(pkgContents);
    pkgJSON['resolutions'][pkgName] = `~${version.toString()}`;

    let outputContents = JSON.stringify(pkgJSON, undefined, 2);
    fs.writeFileSync("./package.json", outputContents);
}

console.log("===== Updating Trivy DB =====");
runCommand(`${TRIVY_COMMAND} --download-db-only`);

console.log("===== Scanning with Trivy =====");
const scanOutput = runCommand(`${TRIVY_COMMAND} --skip-db-update -f json -o /repo/vulns.json --ignore-unfixed --scanners vuln . `);
console.log(scanOutput);

let results = readTrivyResults("./vulns.json");
let parsedResults = parseTrivyResults(results);

let changeStages = getPatchStages(parsedResults);
runPatchStages(changeStages);