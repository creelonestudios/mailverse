// Example input: "12-Dec-2025 14:30:00 +0100"
export function parseImapDate(imapDate: string) {
	// Split the date and timezone
	const [datePart, timePart, tzPart] = imapDate.split(/[\s]+/)

	// Convert month name to number
	const months: Record<string, number> = {
		Jan: 0,
		Feb: 1,
		Mar: 2,
		Apr: 3,
		May: 4,
		Jun: 5,
		Jul: 6,
		Aug: 7,
		Sep: 8,
		Oct: 9,
		Nov: 10,
		Dec: 11
	}
	const [dayStr, monStr, yearStr] = datePart.split("-")

	if (!(monStr in months)) {
		return null
	}

	const month = months[monStr]
	const year = parseInt(yearStr, 10)
	const day = parseInt(dayStr, 10)

	// Parse time
	const [hours, minutes, seconds] = timePart.split(":").map(Number)

	// Parse timezone offset
	const tzSign = tzPart[0] === "+" ? 1 : -1
	const tzHours = parseInt(tzPart.slice(1, 3), 10)
	const tzMinutes = parseInt(tzPart.slice(3, 5), 10)
	const tzOffset = tzSign * (tzHours * 60 + tzMinutes)

	// Create UTC timestamp
	const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds))

	// Apply timezone offset
	date.setMinutes(date.getMinutes() - tzOffset)

	return date
}
