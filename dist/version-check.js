"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkForUpdates = checkForUpdates;
const axios_1 = __importDefault(require("axios"));
const chalk_1 = __importDefault(require("chalk"));
const PACKAGE_NAME = '@armsteadj1/granola-sync';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE = require('path').join(require('os').homedir(), '.granola-sync-version-cache.json');
function readCache() {
    try {
        const fs = require('fs');
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    }
    catch (error) {
        // Ignore cache errors
    }
    return null;
}
function writeCache(cache) {
    try {
        const fs = require('fs');
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    }
    catch (error) {
        // Ignore cache errors
    }
}
async function fetchLatestVersion() {
    try {
        const response = await axios_1.default.get(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
            timeout: 2000, // 2 second timeout
        });
        return response.data.version;
    }
    catch (error) {
        return null;
    }
}
async function checkForUpdates(currentVersion) {
    // Non-blocking - run in background
    setImmediate(async () => {
        try {
            const cache = readCache();
            const now = Date.now();
            // Check cache first
            if (cache && now - cache.lastCheck < CHECK_INTERVAL) {
                if (cache.latestVersion && cache.latestVersion !== currentVersion) {
                    showUpdateMessage(currentVersion, cache.latestVersion);
                }
                return;
            }
            // Fetch latest version
            const latestVersion = await fetchLatestVersion();
            if (latestVersion) {
                writeCache({ lastCheck: now, latestVersion });
                if (latestVersion !== currentVersion) {
                    showUpdateMessage(currentVersion, latestVersion);
                }
            }
        }
        catch (error) {
            // Silent fail - don't interrupt user experience
        }
    });
}
function showUpdateMessage(currentVersion, latestVersion) {
    console.log('');
    console.log(chalk_1.default.yellow('┌─────────────────────────────────────────────────────────┐'));
    console.log(chalk_1.default.yellow('│') + '  ' + chalk_1.default.bold('Update available!') + ' ' + chalk_1.default.dim(currentVersion) + ' → ' + chalk_1.default.green(latestVersion) + '                  ' + chalk_1.default.yellow('│'));
    console.log(chalk_1.default.yellow('│') + '                                                         ' + chalk_1.default.yellow('│'));
    console.log(chalk_1.default.yellow('│') + '  Run: ' + chalk_1.default.cyan('npm install -g @armsteadj1/granola-sync') + '      ' + chalk_1.default.yellow('│'));
    console.log(chalk_1.default.yellow('└─────────────────────────────────────────────────────────┘'));
    console.log('');
}
