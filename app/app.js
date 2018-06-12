/** 
 * Copyright (C) 2018 Menome Technologies Inc.  
 * 
 * The entry point to the file processing pipeline.
 * Handles messages from crawls or filestore events and queues them up for graph updates.
 */
"use strict";
const path = require("path");
const Bot = require('@menome/botframework');
const config = require("../config/config.json");
const configSchema = require("./config-schema");
const messageParser = require("./message-parser");

// Start the actual bot here.
var bot = new Bot({
  config: {
    "name": "File Process Maw",
    "desc": "Entry Point for the File Processing Pipeline",
    ...config
  },
  configSchema
});

// Listen on the Rabbit bus.
var mp = new messageParser(bot);
bot.rabbit.addListener("processorQueue", mp.handleMessage);

// Set up our security middleware.
bot.registerControllers(path.join(__dirname+"/controllers"));

bot.start();
bot.changeState({state: "idle"});