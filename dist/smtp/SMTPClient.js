import net from "net";
import tls from "tls";
export default class SMTPClient {
    static async sendMessage(host, port, from, to, content, useTLS) {
        // const sock = net.createConnection(port, host)
        const sock = useTLS ? tls.connect(port, host) : net.createConnection(port, host);
        sock.on("data", (data) => {
            console.log("[SMTPClient] Received data: " + data.toString());
        });
        sock.on("connect", async () => {
            console.log("[SMTPClient] Connected to server");
            sock.write("EHLO localhost\r\n");
            sock.write("MAIL FROM:<" + from + ">\r\n");
            sock.write("RCPT TO:<" + to + ">\r\n");
            sock.write("DATA\r\n");
            sock.write(content + "\r\n.\r\n");
            sock.write("QUIT\r\n");
        });
    }
}
