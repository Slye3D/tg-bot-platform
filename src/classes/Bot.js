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
	}

	/**
	 *
	 */
	start(){
		var options = arguments.length > 0 ? arguments[0] : {};
		// Create a bot with given token
		global.TgBotApi = new TelegramBot(this._token, options);

		global.TgBotApi.on('inline_query', (msg) => {
			// console.log(msg)
		});
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
			if(this._pagation[value].indexOf(value) < 0){
				this._pagation[value].push(value);
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
						m_ret.send(user);
					}
				})
			}else {
				if(m_ret instanceof BotMessage){
					m_ret.send(user);
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
					m_ret.send(user);
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
						msg.load(q, user);
					}else {
						var msg = new BotMessage();
						var h   = JSON.parse(re);
						if(edit_any_way && h[0] == 'text'){
							message.editText(h[1].text, h[1].options)
						}else {
							msg.load(re);
							msg.send(user);
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
}