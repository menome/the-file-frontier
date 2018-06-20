/**
 * Copyright (c) 2017 Menome Technologies Inc.
 * Configuration for the bot
 */
"use strict";

module.exports = {
  rabbit_outgoing: {
    url: {
      doc: "The URL of the rabbitmq endpoint. ",
      format: String,
      default: "amqp://rabbitmq:rabbitmq@rabbit:5672?heartbeat=3600",
      env: "RABBIT_OUTGOING_URL",
      sensitive: true
    },
    routingKey: {
      doc: "The URL of the rabbitmq endpoint. ",
      format: String,
      default: "syncevents.harvester.updates.example",
      env: "RABBIT_OUTGOING_ROUTING_KEY"
    },
    exchange: {
      doc: "The RMQ Exchange we're connecting to",
      format: String,
      default: "syncevents",
      env: "RABBIT_OUTGOING_EXCHANGE"
    },
    exchangeType: {
      doc: "The type of RMQ exchange we're creating",
      format: ["topic","fanout"],
      default: "topic",
      env: "RABBIT_OUTGOING_EXCHANGE_TYPE"
    },
    prefetch: {
      doc: "Number of items we can be processing concurrently",
      format: Number,
      default: 5,
      env: "RABBIT_OUTGOING_PREFETCH" 
    }
  },
  downstream_actions: { // Tells us where to put stuff based on 
    doc: "Key/value pairs. keys are string-type result codes. Values are the next routing key to push the message to, or false to end the processing.",
    default: { success: false, error: false},
    format: function check(routing) {
      Object.keys(routing).forEach((key) => {
        if(typeof routing[key] !== 'string' && routing[key] !== false)
          throw new Error("Routing keys must be strings, or 'false'.")
      })
    }
  }
};