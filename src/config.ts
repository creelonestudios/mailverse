import Logger from "./Logger.js"
import { existsSync } from "fs"
import { readFile } from "fs/promises"

const config: Json = existsSync("config.json") ? JSON.parse(await readFile("config.json", "utf-8")) : {}

const logger = new Logger("config", "PINK")

type ConfigValue = string | number | boolean
type Json = { [P in string]: Json | ConfigValue | null }

export default function getConfig<T extends ConfigValue>(key: string, defaultValue?: T): T {
	let value: ConfigValue | undefined
	let error: string | undefined

	try {
		value = searchJsonKey(key)

		// console.log(`json: [${searchJsonKey(key)}]`)
	} catch (e: unknown) {
		error = e as string
	}

	value = value ?? getEnvVar(key) ?? defaultValue

	// console.log("config:", key, value)
	if (value != undefined) {
		if (error) logger.warn(error)
		if (defaultValue != undefined && typeof value != typeof defaultValue) {
			// throw error when types don't match
			throw new Error(`Config type of ${key} does not match default value (${typeof defaultValue}).`)
		}

		return value as T
	}

	throw error || new Error(`Config key ${key} not found`)
}

function getEnvVar(key: string): ConfigValue | undefined {
	const value = process.env[key] ?? process.env[key.replaceAll(".", "_")]

	if (!value) return undefined

	return parseStringValue(value)
}

function parseStringValue(value: string): ConfigValue {
	// boolean
	if (value == "true") return true
	else if (value == "false") return false

	// number
	else if (!isNaN(Number(value))) return Number(value)


	// string
	return value
}

function searchJsonKey(key: string): ConfigValue | undefined {
	const path = key.split(".")

	// console.log("[getConfig]", key, path)

	let value: unknown = config[path[0]]
	if (!value) {
		if (path.length > 1) throw `Config key ${key} not found (${path[0]} is invalid: ${value})`

		return undefined
	}

	for (let i = 1; i < path.length; i++) {
		if (typeof value != "object" || value == null) throw `Config key ${key} not found (${path.slice(0, i).join(".")} is ${typeof value})`
		if (!(path[i] in value)) throw `Config key ${key} not found (${path[i]} does not exist on ${path.slice(0, i).join(".")})`

		value = (value as Json)[path[i]]
	}

	if (isValid(value)) return value
	if (typeof value == "object") logger.warn(`Invalid config value (${key}):`, value instanceof Array ? "[...]" : "{...}")

	return undefined
}

function isValid(value: unknown): value is ConfigValue {
	return ["string", "number", "boolean"].includes(typeof value)
}
