"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.granolaRequest = granolaRequest;
exports.listDocuments = listDocuments;
exports.getTranscript = getTranscript;
const axios_1 = __importDefault(require("axios"));
const paths_1 = require("./paths");
const auth_1 = require("./auth");
const logger_1 = require("./logger");
async function granolaRequest(endpoint, data = {}) {
    const token = await (0, auth_1.getGranolaToken)();
    const url = `${paths_1.GRANOLA_API_BASE}${endpoint}`;
    const response = await axios_1.default.post(url, data, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Granola/5.354.0',
            'X-Client-Version': '5.354.0',
        },
    });
    return response.data;
}
async function listDocuments(limit = 2000) {
    try {
        const data = await granolaRequest('/v1/get-documents', { limit });
        if (Array.isArray(data)) {
            return data;
        }
        return [];
    }
    catch (err) {
        logger_1.logger.warning(`Failed to list documents from API: ${err}`);
        return [];
    }
}
async function getTranscript(documentId) {
    try {
        const data = await granolaRequest('/v1/get-document-transcript', {
            document_id: documentId,
        });
        if (Array.isArray(data)) {
            return data;
        }
        const obj = data;
        return obj.transcript || [];
    }
    catch (err) {
        logger_1.logger.warning(`Failed to get transcript for ${documentId}: ${err}`);
        return [];
    }
}
