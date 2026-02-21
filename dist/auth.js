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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGranolaAuth = loadGranolaAuth;
exports.saveGranolaAuth = saveGranolaAuth;
exports.refreshGranolaToken = refreshGranolaToken;
exports.getGranolaToken = getGranolaToken;
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const paths_1 = require("./paths");
const logger_1 = require("./logger");
function loadGranolaAuth() {
    if (!fs.existsSync(paths_1.GRANOLA_AUTH_PATH)) {
        throw new Error(`Granola auth not found at ${paths_1.GRANOLA_AUTH_PATH}. ` +
            "Make sure Granola is installed and you're logged in.");
    }
    const data = JSON.parse(fs.readFileSync(paths_1.GRANOLA_AUTH_PATH, 'utf-8'));
    const tokens = JSON.parse(data.workos_tokens);
    return tokens;
}
function saveGranolaAuth(tokens) {
    const raw = fs.readFileSync(paths_1.GRANOLA_AUTH_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const existing = JSON.parse(data.workos_tokens);
    Object.assign(existing, tokens);
    existing.obtained_at = Date.now();
    data.workos_tokens = JSON.stringify(existing);
    fs.writeFileSync(paths_1.GRANOLA_AUTH_PATH, JSON.stringify(data));
}
async function refreshGranolaToken(refreshToken) {
    const response = await axios_1.default.post(paths_1.WORKOS_AUTH_URL, {
        client_id: paths_1.WORKOS_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    }, { headers: { 'Content-Type': 'application/json' } });
    return response.data;
}
async function getGranolaToken() {
    const tokens = loadGranolaAuth();
    // Check if token is expired (with 5 minute buffer)
    const obtainedAt = (tokens.obtained_at || 0) / 1000;
    const expiresIn = tokens.expires_in || 0;
    const expiryTime = obtainedAt + expiresIn - 300;
    if (Date.now() / 1000 > expiryTime) {
        logger_1.logger.info('Granola token expired, refreshing...');
        const newTokens = await refreshGranolaToken(tokens.refresh_token);
        saveGranolaAuth(newTokens);
        return newTokens.access_token;
    }
    return tokens.access_token;
}
