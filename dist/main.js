import POP3Server from "./pop3/POP3Server.js";
import SMTPServer from "./smtp/SMTPServer.js";
const smtpserver = new SMTPServer(25); // Port 25 for regular SMTP, 465 for SMTPS
const pop3server = new POP3Server(110); // Port 110 for regular POP3, 995 for POP3S
