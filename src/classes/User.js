/*****************************************************************************
 *   This program is free software: you can redistribute it and/or modify    *
 *   it under the terms of the GNU General Public License as published by    *
 *   the Free Software Foundation, either version 3 of the License, or       *
 *   (at your option) any later version.                                     *
 *___________________________________________________________________________*
 *   This program is distributed in the hope that it will be useful,         *
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of          *
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the           *
 *   GNU General Public License for more details.                            *
 *___________________________________________________________________________*
 *   You should have received a copy of the GNU General Public License       *
 *   along with this program.  If not, see <http://www.gnu.org/licenses/>.   *
 *___________________________________________________________________________*
 *                             Created by  Qti3e                             *
 *        <http://Qti3e.Github.io>    LO-VE    <Qti3eQti3e@Gmail.com>        *
 *****************************************************************************/

/**
 * This class is an object of a user, which means all of implements of this class
 *  are kindly a Telegram account, you can send them a message, video, ... or
 *  receive messages from them
 */
class User {
	/**
	 * Set the initial user's value like id and name, etc...
	 * @param user
	 */
	constructor(user) {
		this.id             = user.id;
		this.first_name     = user.first_name;
		this.last_name      = user.last_name;
		this.username       = user.username;
		this.language_code  = user.language_code;
	}

	/**
	 * Check if a user is member of a chat or not.
	 * The chat might be a chanel id. (But it requires administration permissions)
	 * @param chat_id
	 * @param force_update
	 * @returns {Promise}
	 */
	isMemberOf(chat_id, force_update = false){
		return new Promise((resolve) => {
			global.RedisClient.get('i:' + this.id, (err, re) => {
				if(re == null || force_update){
					global.TgBotApi.getChatMember(chat_id, this.id).then((ChatMember) => {
						var re = ChatMember.status && (ChatMember.status == 'member' || ChatMember.status == 'administrator' || ChatMember.status == 'creator');
						global.RedisClient.set('i:' + this.id, re ? 1 : 0);
						global.RedisClient.expire('i:' + this.id, 20);
						resolve(re);
					});
				}else {
					global.RedisClient.expire('i:' + this.id, 20);
					re = parseInt(re);
					if(re){
						resolve(true);
					}else {
						resolve(false);
					}
				}
			});
		});
	}

	/**
	 * Set a value for user (This function is like setting cookies)
	 * @param key
	 * @param value
	 * @returns {*}
	 */
	set(key, value){
		return global.RedisClient.hset(':u' + this.id, key, JSON.stringify(value));
	}

	/**
	 * Get a cookie value
	 * @param key
	 * @param callback
	 * @returns {string}
	 */
	get(key, callback){
		global.RedisClient.hget(':u' + this.id, key, (err, re) => {
			if(typeof callback !== 'function')
				return;
			callback((re == '' || re == null || re == undefined) ? '' : JSON.parse(re))
		});
	}

	mGet(keys, callback){
		global.RedisClient.hmget(':u' + this.id, keys, (err, re) => {
			if(typeof callback !== 'function')
				return;
			re.forEach((value, key) => {
				re[key] = (value == '' || value == null || value == undefined) ? '' : JSON.parse(value);
			});
			callback.apply(null, re);
		});
	}

	del(key, callback){
		global.RedisClient.del(':u' + this.id, key, (err, re) => {
			if(typeof callback !== 'function')
				return;
			callback(re);
		})
	}

	/**
	 *
	 * @param message
	 * @returns {Promise}
	 */
	send(message){
		return new BotMessage('text', message, arguments[1]).send(this);
	}

	/**
	 * Get the latest message that has been sent to user
	 * @param callback
	 */
	getLastMessage(callback){
		this.get(':lastmsg', (msg) => {
			if(typeof msg == 'object')
				callback(new BotMessageSent({
					message_id: msg.id,
					chat: this,
					text: msg.text
				}, msg.type, this.id));
			else
				callback(false)
		})
	}
}