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
async function fetchAndCacheLatestVersion() {
    try {
        const response = await axios_1.default.get(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
            timeout: 3000,
        });
        const latestVersion = response.data.version;
        if (latestVersion) {
            writeCache({ lastCheck: Date.now(), latestVersion });
        }
    }
    catch (error) {
        // Silent fail — don't interrupt user experience
    }
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
function isNewer(a, b) {
    // Returns true if version a is strictly newer than version b
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0))
            return true;
        if ((pa[i] || 0) < (pb[i] || 0))
            return false;
    }
    return false;
}
function checkForUpdates(currentVersion) {
    // 1. Check cache synchronously — show banner immediately if update is known
    const cache = readCache();
    if (cache && cache.latestVersion && isNewer(cache.latestVersion, currentVersion)) {
        showUpdateMessage(currentVersion, cache.latestVersion);
    }
    // 2. Refresh cache in background if stale (>24h) — result shows on NEXT run
    const now = Date.now();
    if (!cache || now - cache.lastCheck >= CHECK_INTERVAL) {
        setImmediate(() => { fetchAndCacheLatestVersion(); });
    }
}
