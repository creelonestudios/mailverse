import { Model } from "sequelize-typescript";
import Mail from "./Mail.js";
export default class User extends Model {
    name: string;
    username: string;
    password: string;
    mails: Mail[];
    getMail(id: number): Promise<any>;
}
