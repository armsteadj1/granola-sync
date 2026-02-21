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
exports.logger = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
// Ensure log directory exists at import time
try {
    fs.mkdirSync(path.dirname(paths_1.LOG_PATH), { recursive: true });
}
catch {
    // Ignore if already exists or can't create
}
function formatLog(level, message) {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    return `${timestamp} - ${level} - ${message}`;
}
function writeLog(level, message) {
    const line = formatLog(level, message) + '\n';
    try {
        fs.appendFileSync(paths_1.LOG_PATH, line);
    }
    catch {
        // Ignore log write errors
    }
    process.stdout.write(line);
}
exports.logger = {
    info: (msg) => writeLog('INFO', msg),
    warning: (msg) => writeLog('WARNING', msg),
    error: (msg) => writeLog('ERROR', msg),
};
