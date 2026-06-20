import {execSync} from "node:child_process"
import * as fs from "node:fs"
import * as semver from "semver"

const DOCKER_BINARY = process.env.DOCKER_BINARY || "podman"
const TRIVY_COMMAND = `${DOCKER_BINARY} run -v trivy:/cache -v $PWD:/repo aquasec/trivy:0.70.0 repository --cache-dir /cache`
const PKG_PATTERN = new RegExp(/(?<pkgName>(?:@|).*?)@.*/g)

const readJSON = (path: string): object => {
    try {
        return JSON.parse(fs.readFileSync(path).toString())
    } catch (error) {
        throw new Error(`Failed to parse JSON from ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

const writeJSON = ((content: any) => {
    fs.writeFileSync("./package.json", JSON.stringify(content, undefined, 2))
})

let e2e = false
let bump = false
let clear = false

class Package {
    packageName: string
    shortPackageName: string
    packageVersion: semver.SemVer
    patchCandidates: semver.SemVer[]
    closestCandidate!: semver.SemVer
    closestCandidateDiff!: semver.ReleaseType

    constructor(fullPackageName: string, currentPackageVersion: string, patchCandidates: string[]) {
        this.packageName = fullPackageName
        let pkgNameMatch = fullPackageName.matchAll(PKG_PATTERN)
        let shortPackageName = ""
        for (let match of pkgNameMatch) {
            shortPackageName = match.groups!.pkgName
        }
        this.shortPackageName = shortPackageName
        if (!semver.valid(currentPackageVersion)) {
            throw new Error(`Invalid version: ${currentPackageVersion}`)
        }
        this.packageVersion = semver.parse(currentPackageVersion)!

        this.patchCandidates = this.dedupeAndSortVersions(this.packageVersion, patchCandidates)
        if (this.patchCandidates.length === 0) {
            console.warn(`No patch candidates found for ${this.packageName}@${this.packageVersion.toString()}`)
            return
        }
        this.closestCandidate = this.patchCandidates[0]
        this.closestCandidateDiff = semver.diff(this.packageVersion, this.closestCandidate)!
    }

    private dedupeAndSortVersions(matchVersion: semver.SemVer, patchCandidates: string[]): semver.SemVer[] {
        let patchSet = new Set<semver.SemVer>()
        for (let patchCandidate of patchCandidates) {
            const parsed = semver.parse(patchCandidate)
            if (parsed) {
                patchSet.add(parsed)
            }
        }

        let dedupedCandidates = new Array(...patchSet).sort()
        let diffedCandidates = dedupedCandidates.filter((v) => {
            return semver.lt(matchVersion, v)
        }).sort((a, b) => {
            return semver.compare(a, b)
        })

        return diffedCandidates
    }

    /**
     * merge
     */
    public merge(patchCandidates: string[]) {
        let patchSet = new Set<string>(patchCandidates)
        this.patchCandidates.map((ver: semver.SemVer) => patchSet.add(ver.format()))
        this.patchCandidates = this.dedupeAndSortVersions(this.packageVersion, new Array(...patchSet))
    }

    /**
     * prettyPrint
     */
    public prettyPrint() {
        console.log(`\npackageName: ${this.packageName}\nshortPackageName: ${this.shortPackageName}\npackageVersion: ${this.packageVersion.toString()}\npatchCandidates: ${this.patchCandidates.map((pc: semver.SemVer) => {return pc.toString()}).join(', ')}\nclosestCandidate: ${this.closestCandidate.toString()}\nclosestCandidateDiff: ${this.closestCandidateDiff.toString()}`)
    }
}

// Run a command line command and return the output
function runCommand(command: string, description: string = ""): string {
    console.log(`\n--- Executing: ${command}`)
    try {
        const output = execSync(command, { encoding: "utf-8" })
        console.log(output.trim())
        return output
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        if (errorMsg.includes("Command failed") || errorMsg.includes("Command killed")) {
            console.error(`Error: ${description || command}\n${errorMsg}`)
        } else {
            console.error(`Error running "${command}": ${errorMsg}`)
        }
        throw error
    }
}

function readTrivyResults(fileName: string): object {
    try {
        return readJSON(fileName)
    } catch (error) {
        throw new Error(`Failed to read Trivy results from ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

function parseTrivyResults(results: any): Map<string, Package> {
    let importantResults = new Map<string, Package>()

    for (let resultSet of results['Results']) {
        if (resultSet['Type'] === "yarn") {
            for (let result of resultSet['Vulnerabilities']) {
                let currentVersion = result['InstalledVersion']
                let fixedVersions = result['FixedVersion'].split(",") as string[]

                fixedVersions = fixedVersions.map((value) => value.trim()).filter((v) => v)

                if (!fixedVersions.length) {
                    console.log(`No fixed versions found for ${result['PkgID']}@${currentVersion}`)
                    continue
                }

                if (importantResults.has(result['PkgID'])) {
                    importantResults.get(result['PkgID'])?.merge(fixedVersions)
                } else {
                    try {
                        let newPackage = new Package(result['PkgID'], currentVersion, fixedVersions)
                        importantResults.set(result['PkgID'], newPackage)
                    } catch (err) {
                        console.error(`Failed to create Package for ${result['PkgID']}: ${err}`)
                    }
                }
            }
        }
    }
    return importantResults
}

function prettyPrintResults(parsedResults: Map<string, Package>) {
    for (let [_, pkg] of parsedResults) {
        let curVer = pkg.packageVersion
        let bestCandidate = pkg.closestCandidate
        let semverDiff = pkg.closestCandidateDiff
        console.log(`${pkg.shortPackageName}: ${curVer} -> ${bestCandidate}: (${semverDiff})`)
    }
}

function doPatches(parsedResults: Map<string, Package>, stage?: string) {
    console.log(`\n===== Beginning ${stage || "general"} updates =====`)
    prettyPrintResults(parsedResults)
    if (parsedResults.size > 0) {
        for (let [_, contents] of parsedResults) {
            attemptUpdate(contents)
        }

        console.log("\n--- Running yarn install")
        runCommand("yarn install", "yarn install")

        if (e2e) {
            console.log("\n--- Running integration tests")
            runCommand("yarn run test:e2e", "integration tests")
        }
    } else {
        console.log("\n--- Nothing to patch!")
    }
}

function getPatchStages(parsedResults: Map<string, Package>): Map<string, Package>[] {
    let smallChanges = new Map<string, Package>()
    let mediumChanges = new Map<string, Package>()
    let largeChanges = new Map<string, Package>()

    parsedResults.forEach((pkgDetails, pkgName) => {
        switch (pkgDetails.closestCandidateDiff) {
            case "patch":
                smallChanges.set(pkgName, pkgDetails)
                break
            case "minor":
                mediumChanges.set(pkgName, pkgDetails)
                break
            case "major":
                largeChanges.set(pkgName, pkgDetails)
                break
            default:
                // For other diffs, decide where to place them
                if (pkgDetails.closestCandidateDiff === "preminor" || pkgDetails.closestCandidateDiff === "prepatch") {
                    smallChanges.set(pkgName, pkgDetails)
                } else if (pkgDetails.closestCandidateDiff === "premajor") {
                    largeChanges.set(pkgName, pkgDetails)
                }
        }
    })

    return [smallChanges, mediumChanges, largeChanges]
}

function runPatchStages(changeStages: Map<string, Package>[]) {
    // batch all patch-level changes together
    doPatches(changeStages[0], "patch")
    doPatches(changeStages[1], "minor")
    for (let [pkgName, pkgDetails] of changeStages[2]) {
        let thisPkg = new Map<string, Package>()
        thisPkg.set(pkgName, pkgDetails)
        doPatches(thisPkg, `major: ${pkgName}`)
    }
}

function cleanResolutions() {
    let pkgJSON = readJSON("./package.json")
    pkgJSON['resolutions'] = pkgJSON['persistentResolutions']

    writeJSON(pkgJSON)
}

function attemptUpdate(pkg: Package) {
    console.log(`attempting to patch ${pkg.shortPackageName}`)
    let pkgJSON = readJSON("./package.json")

    try {
        let yarnWhyOutput = runCommand(`yarn why ${pkg.shortPackageName} --json`, `yarn why ${pkg.shortPackageName}`)
        let lines = yarnWhyOutput.split("\n").slice(0, -1).map((line) => {
            let lineJSON = JSON.parse(line)
            let innerContent = Object.entries<any>(lineJSON.children)[0][1]
            if (innerContent && innerContent.descriptor && innerContent.descriptor.includes("virtual")) {
                innerContent.descriptor = innerContent.descriptor.replace(/virtual.*:/g, "")
            }
            return innerContent
        })

        for (let innerContent of lines) {
            if (innerContent && innerContent.descriptor) {
                pkgJSON['resolutions'][innerContent.descriptor] = `~${pkg.closestCandidate.toString()}`
            }
        }
    } catch (err) {
        console.error(`Failed to update ${pkg.shortPackageName}: ${err}`)
    }

    try {
        writeJSON(pkgJSON)
    } catch (err) {
        console.error(`Failed to write package.json: ${err}`)
    }
}

function bumpVersion() {
    console.log("\n===== Bumping version =====")
    try {
        runCommand("yarn version patch", "yarn version patch")

        let currentBranch = runCommand("git rev-parse --abbrev-ref HEAD", "current branch")

        // Sanitize branch name from version
        const versionOutput = runCommand("jq -r .version package.json", "get version")
        const sanitizedVersion = semver.parse(versionOutput)?.version?.replace(/\./g, '-') || versionOutput
        const sanitizedBranchName = `backstage-${sanitizedVersion}`

        if (currentBranch === "main") {
            console.log("===== Creating new branch =====")
            try {
                runCommand(`git checkout -b ${sanitizedBranchName}`, `git checkout -b ${sanitizedBranchName}`)
            } catch (err) {
                console.error(`Failed to create branch ${sanitizedBranchName}: ${err}`)
            }
        }

        console.log("===== Staging changes =====")
        runCommand("git add -A", "stage all changes")

        if (!bump) {
            console.log("Skipping commit (bump flag not set)")
            return
        }

        runCommand("git commit -m 'automated patches'", "git commit")
        runCommand(`git push -u HEAD ${sanitizedBranchName}`, `git push -u HEAD ${sanitizedBranchName}`)
    } catch (err) {
        console.error(`Version bump failed: ${err}`)
    }
}

function parseFlags() {
    let flagMap: Map<string, boolean> = new Map()

    let matchPattern = /^\-+(?<isFalse>no\-|)(?<flag>.*)/
    for (let arg of process.argv) {
        let argMatch = matchPattern.exec(arg)
        if (argMatch !== null) {
            flagMap.set(argMatch.groups?.flag!, argMatch.groups?.isFalse === "")
        }
    }

    if (flagMap.has('help') || flagMap.has('h')) {
        console.log(`yarn run patch

Flags
  --help        you are here
  --bump        bump patch version
  --no-bump     don't bump patch version
  --e2e         run e2e tests
  --no-e2e      skip e2e tests
  --clear       only clear pins and exit
`)
        process.exit(0)
    }

    if (flagMap.has('e2e')) {
        e2e = flagMap.get('e2e')!
    }

    if (flagMap.has('clear')) {
        clear = flagMap.get('clear')!
    }

    if (flagMap.has('bump')) {
        bump = flagMap.get('bump')!
    }
}

parseFlags()

console.log("\n===== Clearing old pins ======")
cleanResolutions()

console.log("===== Running baseline yarn install ======")
runCommand("yarn install", "baseline yarn install")

if (clear) {
    process.exit(0)
}

console.log("===== Updating Trivy DB ======")
try {
    runCommand(`${TRIVY_COMMAND} --download-db-only`, "update Trivy DB")
} catch (err) {
    console.warn("Could not update Trivy DB: ", err)
}

console.log("===== Scanning with Trivy ======")
try {
    runCommand(`${TRIVY_COMMAND} --skip-db-update -f json -o /repo/vulns.json --ignore-unfixed --scanners vuln .`, "scan with Trivy")
} catch (err) {
    console.error("Trivy scan failed: ", err)
    process.exit(1)
}

let results = readTrivyResults("./vulns.json")
let parsedResults = parseTrivyResults(results)

console.log("===== Running patches by stage ======")
let changeStages = getPatchStages(parsedResults)
runPatchStages(changeStages)

console.log("\n===== Deduping yarn packages ======")
try {
    runCommand("yarn dedupe", "yarn dedupe")
} catch (err) {
    console.warn("yarn dedupe failed: ", err)
}

console.log("\n===== Installing yarn packages ======")
runCommand("yarn install", "install yarn packages")

console.log("\n===== Re-running scan to ensure fixes ======")
try {
    runCommand(`${TRIVY_COMMAND} --skip-db-update --ignore-unfixed --scanners vuln .`, "re-scan")
} catch (err) {
    console.warn("Re-scan failed: ", err)
}

if (bump) {
    bumpVersion()
}
