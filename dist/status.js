"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDaemonStatus = checkDaemonStatus;
exports.parseRecentLogErrors = parseRecentLogErrors;
exports.formatRelativeTime = formatRelativeTime;
exports.formatSize = formatSize;
exports.fmtDate = fmtDate;
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const paths_1 = require("./paths");
function checkDaemonStatus() {
    const installed = fs.existsSync(paths_1.LAUNCHAGENT_PLIST);
    const result = { installed, running: false, pid: null };
    if (installed) {
        try {
            const proc = (0, child_process_1.spawnSync)('launchctl', ['list', paths_1.LAUNCHAGENT_LABEL], {
                timeout: 5000,
                encoding: 'utf-8',
            });
            if (proc.status === 0) {
                result.running = true;
                const stdout = proc.stdout || '';
                const firstLine = stdout.trim().split('\n')[0] || '';
                const parts = firstLine.split(/\s+/);
                if (parts.length > 0 && parts[0] !== '-' && /^\d+$/.test(parts[0])) {
                    result.pid = parseInt(parts[0], 10);
                }
            }
        }
        catch {
            // Ignore errors
        }
    }
    return result;
}
function parseRecentLogErrors(maxLines = 300, maxErrors = 5) {
    const errors = [];
    if (!fs.existsSync(paths_1.LOG_PATH))
        return errors;
    try {
        const content = fs.readFileSync(paths_1.LOG_PATH, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());
        const recent = lines.slice(-maxLines);
        for (let i = recent.length - 1; i >= 0; i--) {
            const line = recent[i].trim();
            if (line.includes(' - ERROR - ') || line.includes(' - WARNING - ')) {
                errors.push(line);
                if (errors.length >= maxErrors)
                    break;
            }
        }
        errors.reverse();
    }
    catch {
        // Ignore errors
    }
    return errors;
}
function formatRelativeTime(dt) {
    const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
    if (diff < 60)
        return `${diff} second${diff !== 1 ? 's' : ''} ago`;
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return `${m} minute${m !== 1 ? 's' : ''} ago`;
    }
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return `${h} hour${h !== 1 ? 's' : ''} ago`;
    }
    const d = Math.floor(diff / 86400);
    return `${d} day${d !== 1 ? 's' : ''} ago`;
}
function formatSize(sizeBytes) {
    let val = sizeBytes;
    const units = ['B', 'KB', 'MB', 'GB'];
    for (const unit of units) {
        if (val < 1024)
            return `${val.toFixed(1)} ${unit}`;
        val /= 1024;
    }
    return `${val.toFixed(1)} TB`;
}
function fmtDate(dateStr) {
    if (!dateStr)
        return 'unknown date';
    try {
        const dt = new Date(dateStr);
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
    catch {
        return dateStr;
    }
}
