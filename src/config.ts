import { existsSync } from "fs"
import { readFile } from "fs/promises"

export const config = existsSync("config.json") ? JSON.parse(await readFile("config.json", "utf-8")) : {}

export default function getConfig(key: string, defaultValue?: any) {
	if(config[key]) return config[key]
	if(process.env[key]) return process.env[key]
	if(defaultValue != undefined) return defaultValue
	throw new Error("Config key " + key + " not found") // TODO: better error handling?
}