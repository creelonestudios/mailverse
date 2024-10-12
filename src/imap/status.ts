import net from "net"

export const GENERIC_STATUS_RESPONSES = [
	"OK",      // Command completed successfully
	"NO",      // Command failed
	"BAD",     // Protocol error
	"PREAUTH", // Server is in pre-authentication state
	"BYE"      // Server is about to close the connection
]

export const RESPONSE_CODES = [
	"ALERT", // Human-readable alert presented to the user requiring attention
	"ALREADYEXISTS", // When attempting to create something that already exists
	"APPENDUID", // Returned after a successful APPEND operation
	"AUTHENTICATIONFAILED", // Vague Authentication failed
	"AUTHORIZATIONFAILED",
	"BADCHARSET", // CHARSET not supported
	"CANNOT", // This operation violates some invariant of the server and can never succeed
	"CAPABILITY", // Server capability response
	"CLIENTBUG", // The server has detected a client bug
	"CLOSED", // Mailbox is closed
	"CONTACTADMIN", // Contact the system administrator
	"COPYUID", // Returned after a successful COPY operation
	"CORRUPTION", // Data corruption
	"EXPIRED", // The password has expired
	"EXPUNGEISSUED", // Returned after a successful EXPUNGE operation
	"HASCHILDREN", // Cant delete mailbox; mailbox has children
	"INUSE", // Mailbox is in use by another connection
	"LIMIT", // Server limit exceeded
	"NONEXISTENT", // Operation attempted on non-existent thing
	"NOPERM", // No permission
	"OVERQUOTA", // User is over quota
	"PARSE", // Error in parsing
	"PERMANENTFLAGS", // Permanent flags response
	"PRIVACYREQUIRED", // TLS required
	"READ-ONLY", // Mailbox is read-only
	"READ-WRITE", // Mailbox is read-write
	"SERVERBUG", // The server has detected a server bug
	"TRYCREATE", // Mailbox does not exist; try creating it
	"UIDNEXT", // Returned after a successful APPEND operation
	"UIDNOTSTICKY", // Returned after a successful APPEND operation
	"UIDVALIDITY", // Returned after a successful APPEND operation
	"UNAVAILABLE" // Something is unavailable
]

export default function createStatus(socket: net.Socket) {
	return (tag: string | false, status: string, message?: string, responseCode?: string) => {
		socket.write(`${tag ? tag : "*"} ${status} ${responseCode ? `[${responseCode}] ` : ""}${message || ""}\r\n`)
	}
}
