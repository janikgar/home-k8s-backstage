import {execSync} from "node:child_process"
import * as fs from "node:fs"
import * as semver from "semver"

const DOCKER_BINARY = "podman";
const TRIVY_COMMAND = `${DOCKER_BINARY} run -v trivy:/cache -v $PWD:/repo aquasec/trivy:0.69.3 repository --cache-dir /cache`;
const PKG_PATTERN = new RegExp(/(?<pkgName>(?:@|).*?)@.*/g);

const readJSON = (path: string) => JSON.parse(fs.readFileSync(path).toString())

const writeJSON = ((path: string, content: any) => {
    fs.writeFileSync("./package.json", JSON.stringify(content, undefined, 2));
})

class Package {
    packageName: string;
    shortPackageName: string;
    packageVersion: semver.SemVer;
    patchCandidates: semver.SemVer[];
    closestCandidate: semver.SemVer;
    closestCandidateDiff: semver.ReleaseType;

    constructor(fullPackageName: string, currentPackageVersion: string, patchCandidates: string[]){
        this.packageName = fullPackageName;
        let pkgNameMatch = fullPackageName.matchAll(PKG_PATTERN);
        let shortPackageName = ""
        for (let match of pkgNameMatch) {
            shortPackageName = match.groups!.pkgName;
        }
        this.shortPackageName = shortPackageName;
        this.packageVersion = semver.parse(currentPackageVersion)!;

        this.patchCandidates = this.dedupeAndSortVersions(this.packageVersion, patchCandidates);
        this.closestCandidate = this.patchCandidates[0];
        this.closestCandidateDiff = semver.diff(this.packageVersion, this.closestCandidate)!;
    }

    private dedupeAndSortVersions(matchVersion: semver.SemVer, patchCandidates: string[]){
        let patchSet = new Set<semver.SemVer>();
        for (let patchCandidate of patchCandidates) {
            patchSet.add(semver.parse(patchCandidate)!);
        }

        let dedupedCandidates = new Array(...patchSet).sort();
        let diffedCandidates = dedupedCandidates.filter((v) => {
            return semver.lt(matchVersion, v)
        }).sort((a, b) => {return semver.compare(a, b)});

        return diffedCandidates
    }

    /**
     * merge
     */
    public merge(patchCandidates: string[]) {
        let patchSet = new Set<string>(patchCandidates);
        this.patchCandidates.map((ver: semver.SemVer) => patchSet.add(ver.format()));
        this.patchCandidates = this.dedupeAndSortVersions(this.packageVersion, new Array(...patchSet))
    }

    /**
     * prettyPrint
     */
    public prettyPrint() {
        console.log(`
packageName: ${this.packageName}
shortPackageName: ${this.shortPackageName}
packageVersion: ${this.packageVersion.toString()}
patchCandidates: ${this.patchCandidates.map((pc: semver.SemVer) => {return pc.toString()})}
closestCandidate: ${this.closestCandidate.toString()}
closestCandidateDiff: ${this.closestCandidateDiff.toString()}`);
    }
}

// Run a command line command and return the output
function runCommand(command: string): string {
    return execSync(command, { encoding: "utf-8" });
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

        if (importantResults.has(result['PkgID'])) {
            importantResults.get(result['PkgID'])?.merge(fixedVersions);
        } else {
            let newPackage = new Package(result['PkgID'], currentVersion, fixedVersions);
            importantResults.set(result['PkgID'], newPackage);
        }
    }
    return importantResults
}

function prettyPrintResults(parsedResults: Map<string, Package>) {
    for (let [_, pkg] of parsedResults) {
        let curVer = pkg.packageVersion;
        let bestCandidate = pkg.closestCandidate;
        let semverDiff = pkg.closestCandidateDiff;
        console.log(`${pkg.shortPackageName}: ${curVer} -> ${bestCandidate}: (${semverDiff})`);
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
        runCommand("yarn install");

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
    // batch all patch-level changes together
    doPatches(changeStages[0], "patch");
    doPatches(changeStages[1], "minor");
    for (let [pkgName, pkgDetails] of changeStages[2]) {
        let thisPkg = new Map<string, Package>();
        thisPkg.set(pkgName, pkgDetails)
        doPatches(thisPkg, `major: ${pkgName}`);
    }
}

function cleanResolutions() {
    let pkgJSON = readJSON("./package.json");
    pkgJSON['resolutions'] = pkgJSON['persistentResolutions'];

    writeJSON("./package.json", pkgJSON);
}

function attemptUpdate(pkg: Package) {
    let pkgJSON = readJSON("./package.json");

    console.log(`attempting to patch ${pkg.shortPackageName}`)
    let yarnWhyOutput = runCommand(`yarn why ${pkg.shortPackageName} --json`);
    yarnWhyOutput.split("\n").slice(0, -1).map((line) => {
        let lineJSON = JSON.parse(line);
        let innerContent = Object.entries<any>(lineJSON.children)[0][1];
        if (innerContent.descriptor.includes("virtual")) {
            innerContent.descriptor = innerContent.descriptor.replace(/virtual.*:/g, "");
        }
        pkgJSON['resolutions'][innerContent.descriptor] = `~${pkg.closestCandidate.toString()}`;
    });

    writeJSON("./package.json", pkgJSON);
}

function bumpVersion() {
    console.log("===== Bumping version =====");
    runCommand("yarn version patch");

    let currentBranch = runCommand("git rev-parse --abbrev-ref HEAD");
    
    if (currentBranch === "main") {
        console.log("===== Creating new branch =====");
        let versionOutput = runCommand("jq -r .version package.json");
        let sanitizedVersion = semver.parse(versionOutput);
        runCommand(`git checkout -b backstage-${sanitizedVersion}`);
    }
    console.log("===== Staging changes =====");
    runCommand("git commit -a -m 'automated patches'");
    runCommand("git push");
};

// console.log("===== Clearing old pins =====");
// cleanResolutions();

// console.log("===== Running baseline yarn install =====");
// runCommand("yarn install");

// console.log("===== Updating Trivy DB =====");
// runCommand(`${TRIVY_COMMAND} --download-db-only`);

// console.log("===== Scanning with Trivy =====");
// runCommand(`${TRIVY_COMMAND} --skip-db-update -f json -o /repo/vulns.json --ignore-unfixed --scanners vuln . `);

// let results = readTrivyResults("./vulns.json");
// let parsedResults = parseTrivyResults(results);

// console.log("===== Running patches by stage =====");
// let changeStages = getPatchStages(parsedResults);
// runPatchStages(changeStages);

// console.log("===== Deduping yarn packages =====");
// runCommand("yarn dedupe");

// console.log("===== Installing yarn packages =====");
// runCommand("yarn install");

// console.log("===== Re-running scan to ensure fixes =====");
// runCommand(`${TRIVY_COMMAND} --skip-db-update --ignore-unfixed --scanners vuln .`);

bumpVersion();
