export default class SMTPClient {
    static sendMessage(host: string, port: number, from: string, to: string, content: string, useTLS: boolean): Promise<void>;
}
