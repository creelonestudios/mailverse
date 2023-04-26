const ESC = "\u001b"
const RESET = ESC + "[m"
const GRAY  = ESC + "[37m"
const WHITE = ESC + "[97m"
const DARK  = ESC + "[90m"
const RED   = ESC + "[91m"

export default class Logger {

	constructor(private readonly actor: string) {}
	
	log(message: string) {
		console.log(`${WHITE}[${DARK}${time()}${WHITE}] [${GRAY}${this.actor}${WHITE}]${GRAY}`, message)
	}

	error(message: string) {
		console.log(`${WHITE}[${DARK}${time()}${WHITE}] [${RED}${this.actor}${WHITE}]${RED}`, message)
	}

}

function time() {
	const t = new Date()
	const year  =  t.getUTCFullYear()
	const month = (t.getUTCMonth()+"").padStart(2,"0")
	const day   = (t.getUTCDate()+"").padStart(2,"0")
	const hours = (t.getUTCHours()+"").padStart(2,"0")
	const mins  = (t.getUTCMinutes()+"").padStart(2,"0")
	const secs  = (t.getUTCSeconds()+"").padStart(2,"0")
	return `${year}-${month}-${day} ${hours}:${mins}:${secs}`
}
