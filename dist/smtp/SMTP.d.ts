export default class SMTP {
    static handleNewMail(info: {
        from: string;
        to: string[];
        content: string;
    }): Promise<void>;
}
