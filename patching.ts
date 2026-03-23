import {execSync} from "node:child_process"
import * as fs from "node:fs"
import * as semver from "semver"

const DOCKER_BINARY = "podman";
const TRIVY_COMMAND = `${DOCKER_BINARY} run -v trivy:/cache -v $PWD:/repo aquasec/trivy:0.69.3 repository --cache-dir /cache`;
const PKG_PATTERN = new RegExp(/(?<pkgName>.*?)@(?:|virtual.*)npm:(?<pkgVersion>.*)/);

const readJSON = (path: string) => JSON.parse(fs.readFileSync(path).toString())

class Package {
    packageName: string;
    packageVersion: semver.SemVer;
    patchCandidates: semver.SemVer[];
    closestCandidate: semver.SemVer;
    closestCandidateDiff: semver.ReleaseType;

    constructor(fullPackageName: string, currentPackage: string, patchCandidates: string[]){
        this.packageName = fullPackageName;
        this.packageVersion = semver.parse(currentPackage)!;

        let patchSet = new Set<semver.SemVer>();
        for (let patchCandidate of patchCandidates) {
            patchSet.add(semver.parse(patchCandidate)!);
        }

        let dedupedCandidates = new Array(...patchSet).sort();
        let diffedCandidates = dedupedCandidates.filter((v) => {
            return semver.lt(currentPackage, v)
        }).sort();

        this.patchCandidates = diffedCandidates;
        this.closestCandidate = this.patchCandidates[0];
        this.closestCandidateDiff = semver.diff(this.packageVersion, this.closestCandidate)!;
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
        console.log(output);
    }
    return output
}

function readTrivyResults(fileName: string): object {
    return readJSON(fileName) as object;
}

function parseTrivyResults(results: any): Map<string, Package> {
    let importantResults = new Map<string, Package>();

    for (let result of results['Results'][0]['Vulnerabilities']) {
        let currentVersion = result['InstalledVersion'];
        let fixedVersions = result['FixedVersion'].split(",") as string[];

        fixedVersions = fixedVersions.map((value) => value.trim());

        if (importantResults.has(result['PkgName'])) {
            importantResults.get(result['PkgName'])?.merge(currentVersion, fixedVersions);
        } else {
            let newPackage = new Package(result['PkgName'], currentVersion, fixedVersions);
            importantResults.set(result['PkgName'], newPackage);
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
    console.log(`===== Beginning ${stage + " "}updates =====`);
    prettyPrintResults(parsedResults);
    if (parsedResults.size > 0) {
        for (let [_, contents] of parsedResults) {
            attemptUpdate(contents);
        }

        console.log("--- Running yarn install");
        runCommand("yarn install", true);

        console.log("--- Running integration tests");
        runCommand("yarn run test:e2e");
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
    cleanResolutions();
    // batch all patch-level changes together
    doPatches(changeStages[0], "patch");
    doPatches(changeStages[1], "minor");
    for (let [pkgName, pkgDetails] of changeStages[2]) {
        let thisPkg = new Map<string, Package>();
        thisPkg.set(pkgName, pkgDetails)
        doPatches(thisPkg, `major: ${pkgName}`);
    }

    console.log("===== Deduping yarn packages =====");
    runCommand("yarn dedupe", true);
}

function cleanResolutions() {
    let pkgJSON = readJSON("./package.json");
    pkgJSON['resolutions'] = pkgJSON['persistentResolutions'];

    let outputContents = JSON.stringify(pkgJSON, undefined, 2);
    fs.writeFileSync("./package.json", outputContents);
}

function attemptUpdate(pkg: Package) {
    let pkgJSON = readJSON("./package.json");

    let yarnWhyOutput = runCommand(`yarn why ${pkg.packageName} --json`, false);
    yarnWhyOutput.split("\n").slice(0, -1).map((line) => {
        let lineJSON = JSON.parse(line);
        let innerContent = Object.entries<any>(lineJSON.children)[0][1];
        pkgJSON['resolutions'][innerContent.descriptor] = `~${pkg.closestCandidate.toString()}`;
    });

    let outputContents = JSON.stringify(pkgJSON, undefined, 2);
    fs.writeFileSync("./package.json", outputContents);
}

function bumpVersion() {
    console.log("===== Bumping version =====");
    runCommand("yarn version patch", true);

    let currentBranch = runCommand("git rev-parse --abbrev-ref HEAD", true);
    
    if (currentBranch === "main") {
        console.log("===== Creating new branch =====");
        let versionOutput = runCommand("jq -r .version package.json", true);
        let sanitizedVersion = semver.parse(versionOutput);
        runCommand(`git checkout -b backstage-${sanitizedVersion}`, true);
    }
    console.log("===== Staging changes =====");
    runCommand("git commit -a -m 'automated patches'", true);
    runCommand("git push", true);
};

console.log("===== Clearing old pins =====");
cleanResolutions();

console.log("===== Running baseline yarn install =====");
runCommand("yarn install");

console.log("===== Updating Trivy DB =====");
runCommand(`${TRIVY_COMMAND} --download-db-only`);

console.log("===== Scanning with Trivy =====");
runCommand(`${TRIVY_COMMAND} --skip-db-update -f json -o /repo/vulns.json --ignore-unfixed --scanners vuln . `);

let results = readTrivyResults("./vulns.json");
let parsedResults = parseTrivyResults(results);

let changeStages = getPatchStages(parsedResults);
runPatchStages(changeStages);

console.log("===== Re-running scan to ensure fixes =====");
runCommand(`${TRIVY_COMMAND} --skip-db-update --ignore-unfixed --scanners vuln .`);

bumpVersion();
