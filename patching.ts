import {execSync} from "node:child_process"
import * as fs from "node:fs"
import * as semver from "semver"

const DOCKER_BINARY = "podman"
const TRIVY_COMMAND = `${DOCKER_BINARY} run -v trivy:/cache -v $PWD:/repo aquasec/trivy repository --cache-dir /cache`

class ExecSyncReturns<T> {
    pid!: number;
    output!: Array<T | null>;
    stdout!: T;
    stderr!: T;
    status!: number | null;
    signal!: NodeJS.Signals | null;
    error?: Error;

    constructor(stdout: T) {
        this.stdout = stdout;
    }
}

class Package {
    currentVersion: string;
    patchCandidates: Array<string>;
    closestCandidate: string;
    closestCandidateDiff: semver.ReleaseType;

    constructor(currentVersion: string, patchCandidates: Array<string>){
        this.currentVersion = currentVersion;
        let patchSet = new Set<string>();
        for (let patchCandidate of patchCandidates) {
            patchSet.add(patchCandidate);
        }
        this.patchCandidates = new Array(...patchSet).sort();
        this.closestCandidate = this.patchCandidates[0];
        this.closestCandidateDiff = semver.diff(this.currentVersion, this.closestCandidate)!;
    }

    /**
     * merge
     */
    public merge(currentVersion: string, patchCandidates: Array<string>) {
        this.currentVersion = currentVersion;
        let patchSet = new Set<string>(this.patchCandidates);
        patchCandidates.map((patchCandidate) => {patchSet.add(patchCandidate)});
        this.patchCandidates = semver.sort(new Array(...patchSet).sort());
    }
}

// Run a command line command and return the output
function runCommand(command: string): string {
    try {
        const output = execSync(command, { encoding: "utf-8" });
        let outputAsSyncOutput: ExecSyncReturns<string> = JSON.parse(output);
        return outputAsSyncOutput.stdout;
    } catch (errorOutput: any) {
        let errorOutputAsSyncOutput: ExecSyncReturns<string> = errorOutput;
        return errorOutputAsSyncOutput.stdout;
    }
}

function readTrivyResults(fileName: string): object {
    let resultContent = fs.readFileSync(fileName).toString();
    return JSON.parse(resultContent);
}

function parseTrivyResults(results: any): Map<string, Package> {
    let importantResults = new Map<string, Package>();

    for (let result of results['Results'][0]['Vulnerabilities']) {
        let currentVersion = result['InstalledVersion'];
        let fixedVersions = result['FixedVersion'].split(",") as Array<string>;

        fixedVersions = fixedVersions.map((value) => value.trim());

        if (importantResults.has(result['PkgName'])) {
            importantResults.get(result['PkgName'])?.merge(currentVersion, fixedVersions);
        } else {
            let newPackage = new Package(currentVersion, fixedVersions);
            importantResults.set(result['PkgName'], newPackage);
        }
    }
    return importantResults
}

function prettyPrintResults(parsedResults: Map<string, Package>) {
    for (let [pkgName, pkgList] of parsedResults) {
        let curVer = pkgList.currentVersion;
        let bestCandidate = pkgList.closestCandidate;
        let semverDiff = pkgList.closestCandidateDiff;
        console.log(`${pkgName}: ${curVer} -> ${bestCandidate}: (${semverDiff})`);
    }
}

function doPatches(parsedResults: Map<string, Package>) {
    console.log("===== Beginning updates =====")
    prettyPrintResults(parsedResults);
    try {
        for (let [pkgName, contents] of parsedResults) {
            attemptUpdate(pkgName, contents.closestCandidate);
        }
        let yarnOutput = runCommand("yarn install");
        console.log(yarnOutput);
    } catch(reason) {
        console.log(`error: ${reason}`)
    }
}

function getPatchStages(parsedResults: Map<string, Package>): Array<Map<string, Package>> {
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
            default:
                largeChanges.set(pkgName, pkgDetails);
        }
    });

    return [smallChanges, mediumChanges, largeChanges]
}

function runPatchStages(changeStages: Array<Map<string, Package>>){
    // batch all patch-level changes together
    doPatches(changeStages[0]);
}

function attemptUpdate(pkgName: string, version: string) {
    let pkgContents = fs.readFileSync("./package.json").toString();
    let pkgJSON = JSON.parse(pkgContents);
    pkgJSON['resolutions'][pkgName] = version;

    let outputContents = JSON.stringify(pkgJSON, undefined, 2);
    fs.writeFileSync("./package.json", outputContents);
}

runCommand(`${TRIVY_COMMAND} --download-db-only`);

const scanOutput = runCommand(`${TRIVY_COMMAND} --skip-db-update -f json -o /repo/vulns.json --ignore-unfixed --scanners vuln . `);
console.log(scanOutput);

console.log("reading result");
let results = readTrivyResults("./vulns.json");

console.log("parsing result");
let parsedResults = parseTrivyResults(results);

let changeStages = getPatchStages(parsedResults);
runPatchStages(changeStages);