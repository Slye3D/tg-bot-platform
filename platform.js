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
 *
 */
class Bot {
	/**
	 *
	 * @param token
	 * @param channel
	 */
	constructor(token, channel) {
		// Initial Values
		this._pages = {};
		this._links = {};
		this._forms = {};
		this._token = token;
		this._resolveForms = {};
		this._rejectForms = {};
		this._actions   = {};
		this.channel = channel;
		this._pagation = [];
		this._404       = '404';
	}

	/**
	 *
	 */
	start(){
		var options = arguments.length > 0 ? arguments[0] : {};
		// Create a bot with given token
		global.TgBotApi = new TelegramBot(this._token, options);

		// Listen for new incoming messages
		global.TgBotApi.on('message', (msg) => {
			// For know we just support the text messages
			if(!msg.text)
				return;
			var user        = new User(msg.from),
				message     = msg.text;

			user.get('form_id', (form_id) => {
				if(form_id !== ''){
					global.RedisClient.hmget(form_id, [':id', ':name'], (err, ret) => {
						ret = {
							':id'   : parseInt(ret[0]),
							':name' : ret[1]
						};
						var form        = this._forms[ret[':name']];
						var keys        = Object.keys(form);
						var len         = keys.length;

						var editingKey  = keys[ret[':id']];
						global.RedisClient.hset(form_id, editingKey, message);
						global.RedisClient.hincrby(form_id, ':id', 1);
						//Check if form completed or not
						if(ret[':id'] + 1 == len){
							global.RedisClient.hgetall(form_id, (err, result) => {
								this._resolveForms[form_id](result);
								// Cleanup memory
								this._rejectForms[form_id] = null;
								// Close form and remove data from database
								user.del('form_id');
								global.RedisClient.del(form_id);
							})
						}else {
							user.send(form[keys[ret[':id'] + 1]]['placeholder']);
						}
					})
				}else {
					user.get('page', page => {
						if(page == '' || msg.text.substr(0,6) == '/start'){
							// Open start page for the new users
							this.go('open:start', user, false, msg)
						}else {
							user.get('args', args => {
								this._getLinks(page, args, user, message).then(links => {
									if(links[message])
										this.go(links[message], user, false, msg);
									else if(page !== 'index'){
										this._getLinks('index', {}, user, message).then(links => {
											if(links[message])
												this.go(links[message], user, false, msg);
											else if(links !== false){
												this._getLinks(this._404, args, user, message).then(links => {
													if(links[message])
														this.go(links[message], user, false, msg);
												})
											}
										})
									}
								})
							})
						}
					});
				}
			});
		});

		// Listen for receiving new incoming Callback Query
		global.TgBotApi.on('callback_query', (callbackQuery) => {
			var user    = new User(callbackQuery.from),
				action  = callbackQuery.data,
				s       = action.search(':');
			if(action.substr(0, s) == 'open'){
				this.go(action, user, true, callbackQuery.message);
			}
			if(action.substr(0, s) == 'action'){
				this.openAction(action, user, callbackQuery.message, callbackQuery);
			}
		});

		if(this._inline_query)
			global.TgBotApi.on('inline_query', this._inline_query);
		if(this._chosen_inline_result)
			global.TgBotApi.on('chosen_inline_result', this._chosen_inline_result);
	}

	createLink(page, args, is_action = false){
		page = (is_action ? 'action' : 'open') + ':' + page;
		if(args)
			page += '?' + JSON.stringify(args);
		return page;
	}

	/**
	 *
	 * @param page
	 * @param method
	 * @param cache_args
	 * @param expire_time
	 * @param change_history
	 */
	page(page, method, cache_args = [],expire_time = 86400, change_history = true, need_login = true) {
		if(this._pages[page] || typeof method !== 'function')
			return;
		this._pages[page] = [method, cache_args,expire_time, change_history, need_login];
	}

	setPagination(...pages){
		pages.forEach(value => {
			if(this._pagation.indexOf(value) < 0){
				this._pagation.push(value);
			}
		})
	}

	_getPage(name, args, user, is_callback, message){
		var edit_any_way    = false;
		if(is_callback && this._pagation.indexOf(name) > -1){
			edit_any_way = true;
		}
		var page = this._pages[name];
		var method      = page[0],
			cache_args  = page[1],
			expire_time = page[2],
			change_history = page[3],
			need_login  = true;

		if(cache_args === false){
			var m_ret  = method(args, user, is_callback, message);
			if(m_ret instanceof Promise){
				m_ret.then(m_ret => {
					if(m_ret instanceof BotMessage){
						m_ret.send(message.chat_id);
					}
				})
			}else {
				if(m_ret instanceof BotMessage){
					m_ret.send(message.chat_id);
				}
			}
			return change_history;
		}

		if(typeof method !== 'function')
			return false;
		var init = () => {
			var c_args = [];
			cache_args.forEach(value => {
				if(value == '%u'){
					c_args.push(user.id)
				}else if(value == '%c'){
					c_args.push(message.chat_id);
				}else {
					c_args.push(args[value])
				}
			});
			var cache_key   = 'p' + name + ':' + JSON.stringify(c_args);
			var cache_key_  = 'l' + name + ':' + JSON.stringify(c_args);
			var save_cache = (m_ret) => {
				var d;
				if(m_ret instanceof BotMessage){
					d = m_ret.save();
					global.RedisClient.set(cache_key, d);
					m_ret.send(message.chat_id);
				}else if(m_ret instanceof BotMessageSent){
					d = m_ret.save();
					global.RedisClient.set(cache_key, '+'+d);
				}else {
					global.RedisClient.set(cache_key, '-')
				}
				if(typeof expire_time == 'number'){
					global.RedisClient.expire(cache_key, expire_time);
					global.RedisClient.expire(cache_key_,expire_time);
				}
			};
			global.RedisClient.get(cache_key, (err, re) => {
				if(re == null){
					var m_ret   = method(args, user, is_callback, message);
					if(m_ret instanceof Promise){
						m_ret.then(m_ret => {
							save_cache(m_ret);
						})
					}else {
						save_cache(m_ret);
					}
				}else if(re !== '-'){
					if(re[0] == '+'){
						re = JSON.parse(re.substr(1));
						var m   = re[0],
							t   = re[1],
							q   = re[2];
						var msg = new BotMessageSent(message, t);
						msg.load(q, message.chat_id);
					}else {
						var h   = JSON.parse(re);
						if(edit_any_way && h[0] == 'text'){
							message.editText(h[1].text, h[1].options)
						}else {
							var msg = new BotMessage();
							msg.load(re);
							msg.send(message.chat_id);
						}
					}
				}
			});
		};
		if(need_login){
			user.isMemberOf(this.channel).then(re => {
				if (!re)
					return this.go('open:start', user, is_callback, message);
				init()
			});
		}else {
			init();
		}
		return change_history;
	};

	/**
	 *
	 * @param page
	 * @param method
	 * @param cache_args
	 * @param expire_time
	 * @param change_history
	 */
	links(page, method, cache_args = [],expire_time = 86400) {
		if(this._links[page] || typeof method !== 'function')
			return;
		this._links[page] = [method, cache_args, expire_time];
	}

	_getLinks(page, args, user, message){
		var links       = this._links[page];
		var method      = links[0],
			cache_args  = links[1],
			expire_time = links[2];

		if(typeof method !== 'function')
			return new Promise(resolve => {
				resolve({});
			});
		if(cache_args === false){
			return new Promise(resolve => {
				var m_ret   = method(args, user, message);
				if(m_ret instanceof Promise){
					m_ret.then(m_ret => {
						resolve(m_ret)
					})
				}else {
					resolve(m_ret)
				}
			})
		}
		var c_args = [];
		cache_args.forEach(value => {
			if(value == '%u'){
				c_args.push(user.id)
			}else {
				c_args.push(args[value])
			}
		});
		var cache_key = 'l' + page + ':' + JSON.stringify(c_args);
		var cache_key_ = 'p' + page + ':' + JSON.stringify(c_args);


		var save_cache = (m_ret) => {
			global.RedisClient.set(cache_key, JSON.stringify(m_ret));

			if(typeof expire_time == 'number'){
				global.RedisClient.expire(cache_key, expire_time);
				global.RedisClient.expire(cache_key_,expire_time);
			}
		};
		return new Promise(resolve => {
			global.RedisClient.get(cache_key, (err, re) => {
				if(re == null){
					var m_ret   = method(args, user, message);
					if(m_ret instanceof Promise){
						m_ret.then(m_ret => {
							save_cache(m_ret);
							resolve(m_ret)
						})
					}else {
						save_cache(m_ret);
						resolve(m_ret)
					}
				}else{
					re = JSON.parse(re);
					resolve(re);
				}
			});
		})
	}

	/**
	 *
	 * @param link
	 * @param user
	 * @param is_callback
	 * @param msg
	 */
	go(link, user, is_callback, msg) {
		is_callback = is_callback || false;
		var re = ((action) => {
			var s   = action.search(':');
			if(action.substr(0, s) == 'open'){
				var url     = action.substr(s + 1);
				s           = url.search(/\?/);
				var page,
					args = {};
				if(s > 0){
					page    = url.substr(0, s);
					args    = JSON.parse(url.substr(s+1));
				}else {
					page    = url;
				}
				return {
					page: page,
					args: args
				}
			}else if(action.substr(0,s) == 'action'){
				this.openAction(link, user, msg);
			}
			return false
		})(link);
		if(!re)
			return;
		var page    = re['page'],
			args    = re['args'];
		if(!this._pages[page])
			return;

		msg = new BotMessageSent(msg, 'text', user.id);
		var change_history = this._getPage(page, args, user, is_callback, msg);
		if(change_history){
			// ll: last link
			// user.get('ll', (err, data) => {
			// 	if(data !== null){
			// 		global.RedisClient.rpush('h:' + user.id, data);
			// 	}
			// 	global.RedisClient.set('ll', link);
			// });
			user.set('page', page);
			user.set('args', args);
		}
	}

	/**
	 * Register new form
	 * @param name
	 * @param form
	 */
	form(name, form){
		this._forms[name] = form;
	}
	static randomString(len = 32){
		const strings = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		var re = '', i;
		for(i = 0; i < len;i++){
			re += strings[Math.floor(Math.random() * strings.length)]
		}
		return re;
	}

	/**
	 *
	 * @param name
	 * @param user
	 * @returns {Promise}
	 */
	sendForm(name, user){
		return new Promise((resolve, reject) => {
			// Exit if form is not defined
			if(!this._forms[name])
				return;
			// Create a random string for users
			var id  = Bot.randomString();
			// Open form for user
			user.set('form_id', id);

			// Set initial form's data
			global.RedisClient.hset(id, ':id', 0);
			global.RedisClient.hset(id, ':name', name);

			//Save the callback functions
			this._resolveForms[id] = resolve;
			// if(reject)
			// 	this._rejectForms[id] = reject;

			// Expire data after an hour
			// global.RedisClient.expire(id, 60 * 60);
			// setTimeout(function () {
			// 	// todo Call the cancel function after the expire time
			// }, 3600);

			user.send(this._forms[name][Object.keys(this._forms[name])[0]]['placeholder']);
		});
	}

	action(name, method){
		if(this._actions[name] || typeof method !== 'function')
			return;
		this._actions[name] = method;
	}

	openAction(action, user, message, callbackQuery){
		var re = ((action) => {
			var s   = action.search(':');
			if(action.substr(0, s) == 'action'){
				var url     = action.substr(s + 1);
				s           = url.search(/\?/);
				var page,
					args = {};
				if(s > 0){
					page    = url.substr(0, s);
					args    = JSON.parse(url.substr(s+1));
				}else {
					page    = url;
				}
				return {
					page: page,
					args: args
				}
			}
			return false
		})(action);
		message = new BotMessageSent(message,'text', user.id)
		if(typeof this._actions[re.page] == 'function')
			this._actions[re.page](re.args,user, message, callbackQuery);
	}

	answerCallbackQuery(callbackQueryId, text, showAlert = true, options = {}){
		return global.TgBotApi.answerCallbackQuery(callbackQueryId, text, showAlert, options);
	}

	sendChatAction(chat_id ,action){
		return global.TgBotApi.sendChatAction(chat_id, action);
	}

	inline(inline_query, chosen_inline_result){
		this._inline_query          = inline_query;
		this._chosen_inline_result  = chosen_inline_result;
	}

	on404(page){
		this._404 = page;
	}
}/*****************************************************************************
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
 * Use this class to send messages to users :)
 * Example:
 *  new BotMessage('video', '/file.mp4').send(user).then((msg) => {
 *      msg.editCaption('Edited Caption');
 *  });
 */
class BotMessage {
	save(){
		return JSON.stringify([
			this.type,
			this._data
		])
	}
	load(json){
		var r = JSON.parse(json)
		this.type = r[0]
		this._data = r[1];
	}

	/**
	 * Set all initial values and get all of required arguments based on message type
	 * @param type
	 */
	constructor(type){
		type            = type || 'text';
		this.type       = type;
		this._data      = {};

		switch(type){
			case 'text':
				this._data['text']      = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'photo':
				this._data['photo']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'document':
				this._data['doc']       = arguments[1];
				this._data['options']   = arguments[2] || {};
				this._data['fOptions']  = arguments[3] || {};
				break;
			case 'audio':
				this._data['audio']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'sticker':
				this._data['sticker']   = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'voice':
				this._data['voice']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'video':
				this._data['video']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'location':
				this._data['latitude']  = arguments[1];
				this._data['longitude'] = arguments[2];
				this._data['options']   = arguments[3] || {};
				break;
			case 'venue':
				this._data['latitude']  = arguments[1];
				this._data['longitude'] = arguments[2];
				this._data['title']     = arguments[3];
				this._data['address']   = arguments[4];
				this._data['options']   = arguments[5] || {};
				break;
			case 'contact':
				this._data['number']    = arguments[1];
				this._data['firstName'] = arguments[2];
				this._data['options']   = arguments[3] || {};
				break;
		}
	}

	/**
	 * Send message to user
	 * @param user {User|number}
	 * @returns {Promise}
	 */
	send(user){
		var chat_id = user.id || user;

		return new Promise((resolve) => {
			var callback    = (msg) => {
				global.RedisClient.hset(':u' + chat_id, ':lastmsg', JSON.stringify({
					id: msg.message_id,
					type: this.type,
					text: this._data['text']
				}));
				var sent    = new BotMessageSent(msg, this.type, chat_id);
				resolve(sent);
			};
			const TgBotAPI = global.TgBotApi;
			switch(this.type){
				case 'text':
					TgBotAPI.sendMessage(chat_id, this._data['text'], this._data['options']).then(callback);
					break;
				case 'photo':
					TgBotAPI.sendPhoto(chat_id, this._data['photo'], this._data['options']).then(callback);
					break;
				case 'document':
					TgBotAPI.sendDocument(chat_id, this._data['doc'], this._data['options'], this._data['fOptions']).then(callback);
					break;
				case 'audio':
					TgBotAPI.sendAudio(chat_id, this._data['audio'], this._data['options']).then(callback);
					break;
				case 'sticker':
					TgBotAPI.sendSticker(chat_id, this._data['sticker'], this._data['options']).then(callback);
					break;
				case 'voice':
					TgBotAPI.sendVoice(chat_id, this._data['voice'], this._data['options']).then(callback);
					break;
				case 'video':
					TgBotAPI.sendVideo(chat_id, this._data['video'], this._data['options']).then(callback);
					break;
				case 'location':
					TgBotAPI.sendLocation(chat_id, this._data['latitude'], this._data['longitude'], this._data['options']).then(callback);
					break;
				case 'venue':
					TgBotAPI.sendVenue(chat_id, this._data['latitude'], this._data['longitude'], this._data['title'], this._data['address'], this._data['options']).then(callback);
					break;
				case 'contact':
					TgBotAPI.sendContact(chat_id, this._data['number'], this._data['firstName'], this._data['options']).then(callback);
					break;
			}
		});
	}

	caption(caption){
		if(this.type == 'text')
			return;
		this._data['options']['caption'] = caption;
	}

	replyMarkup(reply_markup){
		this._data['options']['reply_markup']   = reply_markup;
	}

	markdown(){
		this._data['options']['parse_mode'] = 'markdown';
	}

	html(){
		this._data['options']['parse_mode'] = 'html';
	}
	
	disablePreview(){
		this._data['options']['disable_web_page_preview'] = false;
	}
}
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
class BotMessageSent{
	save(){
		return JSON.stringify([this.message, this.type, this._q]);
	}

	load(json, user){
		this.chat_id = user.id || user;
		// json = JSON.parse(json);
		json.forEach(value => {
			var method  = value[0],
				args    = [],
				key;
			for(key in value[1]){
				args.push(value[1][key]);
			}
			this[method](...args);
		});
	}

	_load(message){
		this.message        = message;
		this.id             = message.message_id || message.id;
		this.from           = message.from ? new User(message.from) : undefined;
		this.chat           = message.chat instanceof User ? message.chat : new User(message.chat);
		this.forward_from   = message.forward_from ? new User(message.forward_from) : undefined;
		this.chat_id        = this.chat.id;
	}

	constructor(message, type, chat_id){
		this._q = [];
		this.type       = type;
		this.chat_id    = chat_id;
		this._load(message);
	}

	editCaption(newCaption, options){
		this._q.push(['editCaption', arguments]);
		options = options || {};
		if(this.message.reply_markup)
			options.reply_markup = this.message.reply_markup;
		return new Promise((resolve) => {
			global.TgBotApi.editMessageCaption(newCaption, options, {
				chat_id     : this.chat_id,
				message_id  : this.id
			}).then((msg) => {
				this._load(msg);
				resolve(this);
			})
		});
	}

	editText(newText, options){
		this._q.push(['editText', arguments]);
		options = options || {};
		if(newText == this.message.text)
			return;
		return new Promise((resolve) => {
			options.chat_id = this.chat_id;
			options.message_id = this.id;
			global.TgBotApi.editMessageText(newText, options).then((msg) => {
				this._load(msg);
				global.RedisClient.hset(':u' + this.chat_id, ':lastmsg', JSON.stringify({
					id: this.id,
					type: this.type,
					text: newText
				}));
				resolve(this);
			})
		});
	}

	editReplyMarkup(reply_markup){
		this._q.push(['editReplyMarkup', arguments]);
		return new Promise((resolve) => {
			global.TgBotApi.editMessageReplyMarkup(reply_markup, {
				chat_id     : this.chat_id,
				message_id  : this.id
			}).then((msg) => {
				this._load(msg);
				resolve(this);
			})
		})
	}
}/*****************************************************************************
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

const handlebars    = require('handlebars'),
	fs              = require('fs');
global._templateCache  = {};
function TemplateEngine(fileName) {
	var template;
	if(global._templateCache[fileName]){
		template = global._templateCache[fileName];
	}else {
		var file = fs.readFileSync(fileName) + '';
		template = handlebars.compile(file);
		global._templateCache[fileName] = template;
	}
	return (vars) => {
		return template(vars);
	};
}/*****************************************************************************
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
}/*****************************************************************************
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

// Load main dependencies
const TelegramBot   = require('node-telegram-bot-api'),
	redis           = require("redis");

// Set some global vars
// Note: because of this problem you won't be able to run more than one bot in each JS file.
global.RedisClient      = redis.createClient();
global.TgBotApi         = undefined;

// Include classes
module.exports = {
	BotMessage: BotMessage,
	Bot: Bot,
	User: User,
	Pug: TemplateEngine
};
