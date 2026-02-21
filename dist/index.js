#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const cli_1 = require("./cli");
const program = new commander_1.Command();
program
    .name('granola-sync')
    .description('Sync Granola meeting transcripts to Google Drive')
    .version('0.2.0');
(0, cli_1.registerSetup)(program);
(0, cli_1.registerSync)(program);
(0, cli_1.registerStatus)(program);
(0, cli_1.registerConfig)(program);
(0, cli_1.registerDaemon)(program);
(0, cli_1.registerDoctor)(program);
program.parse(process.argv);
