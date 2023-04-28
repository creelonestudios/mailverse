import { existsSync } from "fs"
import { readFile } from "fs/promises"
import Logger from "./Logger.js"

export const config = existsSync("config.json") ? JSON.parse(await readFile("config.json", "utf-8")) : {}

const logger = new Logger("config", "PINK")

type ConfigValue = string | number | boolean

export default function getConfig(key: string, defaultValue?: ConfigValue): any {
	let value: ConfigValue | undefined = undefined
	let error: string | undefined = undefined
	try {
		value = searchJsonKey(key)
		//console.log(`json: [${searchJsonKey(key)}]`)
	} catch (e: any) {
		error = e
	}
	
	value = value ?? process.env[key] ?? process.env[key.replaceAll(".", "_")] ?? defaultValue
	console.log("config:", key, value)
	if (value != undefined) {
		if (error) logger.warn(error)
		return value
	}

	throw new Error(error) || new Error("Config key " + key + " not found")
}

console.log("test:", getConfig("test", "?"))
console.log("this.is.a.path:", getConfig("this.is.a.path", "?"))
console.log("smtp.port", getConfig("smtp.port", "?"))
console.log("smtp_port", getConfig("smtp_port", "?"))

function searchJsonKey(key: string, defaultValue?: ConfigValue): ConfigValue | undefined {
	const path = key.split(".")
	//console.log("[getConfig]", key, path)

	let value: any = config[path[0]]
	if (!value) {
		if (path.length > 1) throw `Config key ${key} not found (${path[0]} is invalid: ${value})`
		return
	}

	for (let i = 1; i < path.length; i++) {
		if (typeof value != "object") throw `Config key ${key} not found (${path.slice(0, i).join(".")} is ${typeof value})`
		value = value[path[i]]
	}

	if (isValid(value)) return value
	if (typeof value == "object") logger.warn(`Invalid config value (${key}):`, value instanceof Array ? "[...]" : "{...}")

	return
}

function isValid(value: any): value is ConfigValue {
	return ["string", "number", "boolean"].includes(typeof value)
}
