import { DataTypes } from "sequelize";
import { AllowNull, Column, HasMany, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";
import Mail from "./Mail.js";
import { createHash } from "node:crypto";

@Table({
	paranoid: true,
	tableName: "users"
})
export default class User extends Model {

	@AllowNull(false)
	@Unique
	@Column(DataTypes.STRING)
	declare name: string

	@AllowNull(false)
	@Unique
	@PrimaryKey
	@Column(DataTypes.STRING)
	declare username: string

	@AllowNull(false)
	@Column({
		type: DataTypes.STRING,
		set(value) {
			const hash = createHash("sha256")
			hash.update(String(value))
			this.setDataValue("password", hash.digest("hex"));
		}
	})
	declare password: string
	
	@HasMany(() => Mail)
	declare mails: Mail[];

	async getMail(id: number) {
		const mails = await this.$get("mails")
		if(!mails) return undefined;
		return mails[id];
	}

}