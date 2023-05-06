import { existsSync } from "fs";
import { readFile } from "fs/promises";
import Logger from "./Logger.js";
export const config = existsSync("config.json") ? JSON.parse(await readFile("config.json", "utf-8")) : {};
const logger = new Logger("config", "PINK");
export default function getConfig(key, defaultValue) {
    let value = undefined;
    let error = undefined;
    try {
        value = searchJsonKey(key);
        //console.log(`json: [${searchJsonKey(key)}]`)
    }
    catch (e) {
        error = e;
    }
    value = value ?? getEnvVar(key) ?? defaultValue;
    //console.log("config:", key, value)
    if (value != undefined) {
        if (error)
            logger.warn(error);
        if (defaultValue != undefined && typeof value != typeof defaultValue) {
            throw new Error(`Config type of ${key} does not match default value (${typeof defaultValue}).`);
        }
        return value;
    }
    throw new Error(error) || new Error("Config key " + key + " not found");
}
function getEnvVar(key) {
    const value = process.env[key] ?? process.env[key.replaceAll(".", "_")];
    if (!value)
        return;
    return parseStringValue(value);
}
function parseStringValue(value) {
    // boolean
    if (value == "true")
        return true;
    else if (value == "false")
        return false;
    // number
    else if (!isNaN(Number(value)))
        return Number(value);
    // string
    return value;
}
function searchJsonKey(key, defaultValue) {
    const path = key.split(".");
    //console.log("[getConfig]", key, path)
    let value = config[path[0]];
    if (!value) {
        if (path.length > 1)
            throw `Config key ${key} not found (${path[0]} is invalid: ${value})`;
        return;
    }
    for (let i = 1; i < path.length; i++) {
        if (typeof value != "object")
            throw `Config key ${key} not found (${path.slice(0, i).join(".")} is ${typeof value})`;
        value = value[path[i]];
    }
    if (isValid(value))
        return value;
    if (typeof value == "object")
        logger.warn(`Invalid config value (${key}):`, value instanceof Array ? "[...]" : "{...}");
    return;
}
function isValid(value) {
    return ["string", "number", "boolean"].includes(typeof value);
}
