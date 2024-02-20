import { AllowNull, BelongsTo, Column, ForeignKey, Model, PrimaryKey, Table, Unique } from "sequelize-typescript"
import { DataTypes } from "sequelize"
import User from "./User.js"

@Table({
	paranoid:  true,
	tableName: "mails"
})
export default class Mail extends Model {

	@AllowNull(false)
	@Unique
	@PrimaryKey
	@Column({
		type:         DataTypes.UUID,
		defaultValue: DataTypes.UUIDV4
	})
	declare uuid: string

	@AllowNull(false)
	@Column(DataTypes.STRING)
	declare from: string

	@AllowNull(false)
	@Column(DataTypes.STRING)
	declare to: string

	@AllowNull(false)
	@Column(DataTypes.STRING)
	declare content: string

	@ForeignKey(() => User)
	declare userUuid: string

	@BelongsTo(() => User)
	declare user: User

}
