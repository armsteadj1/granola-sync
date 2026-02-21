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
exports.LAUNCHAGENT_PLIST = exports.LAUNCHAGENT_LABEL = exports.WORKOS_CLIENT_ID = exports.WORKOS_AUTH_URL = exports.GRANOLA_API_BASE = exports.DRIVE_FOLDER_NAME = exports.GOOGLE_DRIVE_BASE = exports.LOG_PATH = exports.CONFIG_PATH_LEGACY = exports.CONFIG_PATH = exports.SYNC_STATE_PATH = exports.CONFIG_DIR = exports.GRANOLA_CACHE_PATH = exports.GRANOLA_AUTH_PATH = exports.HOME = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
exports.HOME = os.homedir();
exports.GRANOLA_AUTH_PATH = path.join(exports.HOME, 'Library', 'Application Support', 'Granola', 'supabase.json');
exports.GRANOLA_CACHE_PATH = path.join(exports.HOME, 'Library', 'Application Support', 'Granola', 'cache-v3.json');
exports.CONFIG_DIR = path.join(exports.HOME, '.config', 'granola-sync');
exports.SYNC_STATE_PATH = path.join(exports.CONFIG_DIR, 'sync_state.json');
exports.CONFIG_PATH = path.join(exports.CONFIG_DIR, 'config.yaml');
exports.CONFIG_PATH_LEGACY = path.join(exports.CONFIG_DIR, 'config.json');
exports.LOG_PATH = path.join(exports.HOME, 'Library', 'Logs', 'granola-sync.log');
exports.GOOGLE_DRIVE_BASE = path.join(exports.HOME, 'Library', 'CloudStorage');
exports.DRIVE_FOLDER_NAME = 'Granola Transcripts';
exports.GRANOLA_API_BASE = 'https://api.granola.ai';
exports.WORKOS_AUTH_URL = 'https://api.workos.com/user_management/authenticate';
exports.WORKOS_CLIENT_ID = 'client_01JZJ0XBDAT8PHJWQY09Y0VD61';
exports.LAUNCHAGENT_LABEL = 'com.user.granola-sync';
exports.LAUNCHAGENT_PLIST = path.join(exports.HOME, 'Library', 'LaunchAgents', `${exports.LAUNCHAGENT_LABEL}.plist`);
