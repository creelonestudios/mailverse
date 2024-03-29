const ESC = "\u001b"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RESET = ESC + "[m"
const GRAY  = ESC + "[37m"
const DARK  = ESC + "[90m"
const RED   = ESC + "[91m"
const GREEN = ESC + "[92m"
const YELLOW = ESC + "[93m"
const PINK  = ESC + "[95m"
const TEAL  = ESC + "[96m"
const WHITE = ESC + "[97m"

const COLOR = { GRAY, DARK, RED, GREEN, YELLOW, PINK, TEAL, WHITE }

/* eslint no-console: "off" */
export default class Logger {

	constructor(private readonly actor: string, private readonly color: keyof typeof COLOR) {
		if (!global.debug) this.debug = () => {} // only enable debug logs when debugging is on
	}

	log(...message: string[]) {
		console.log(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${GRAY}`, message.join(" "))
	}

	error(...message: string[]) {
		console.log(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${RED}`, message.join(" "))
	}

	warn(...message: string[]) {
		console.warn(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${YELLOW}`, message.join(" "))
	}

	debug(...message: string[]) {
		console.debug(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${TEAL}`, message.join(" "))
	}

	trace(...message: string[]) {
		console.trace(`${WHITE}[${DARK}${time()}${WHITE}] [${COLOR[this.color]}${this.actor}${WHITE}]${WHITE}`, message.join(" "))
	}

}

/* eslint prefer-template: "off" */
function time() {
	const d = new Date()
	const year  =  d.getUTCFullYear()
	const month = (d.getUTCMonth()+"").padStart(2, "0")
	const day   = (d.getUTCDate()+"").padStart(2, "0")
	const hours = (d.getUTCHours()+"").padStart(2, "0")
	const mins  = (d.getUTCMinutes()+"").padStart(2, "0")
	const secs  = (d.getUTCSeconds()+"").padStart(2, "0")

	return `${year}-${month}-${day} ${hours}:${mins}:${secs}`
}
