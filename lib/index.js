'use strict';

const UUID = require('node-uuid');
const Boom = require('boom');

const internals = {};

// if the plugin is registered more than once, we will have multiple catbox policies 
internals.policies = {}

exports.register = function (server, options, next){

    // quick and dirty validation for the plugin options
    
    options.scheme = options.scheme || {};
    options.policy = options.policy || {};

    if (options.scheme.validateFunc){
        return next(new Error('Options for the "cookie" scheme cannot have the "validateFunc" property'));
    }

    if (!options.policy.cache || !options.policy.segment){
        return next(new Error('Options for the catbox policy must have the "cache" and "segment" properties'));
    }

    options.loginDataPath = options.loginDataPath || '/login-data';
    options.logoutPath = options.logoutPath || '/logout';
    options.logoutRedirectTo = options.logoutRedirectTo || '/';

    // create the catbox policy; the underlying catbox client must have been previously 
    // configured in the main server configuration (given in options.policy.cache)

    internals.policies[options.policy.segment] = server.cache(options.policy);
    server.expose(options.policy.segment, internals.policies[options.policy.segment]);

    // create the auth strategy using the 'cookie' auth scheme; we explicitely
    // give the strategy mode as false (3rd parameter); this means that
    // routes WITHOUT an 'auth' config will NOT have this strategy as the default one;
    // note that the strategy mode can be (and should be) configured per route (at config.auth.mode)

    options.strategyName = options.strategyName || 'cookie-cache';
    options.scheme.requestDecoratorName = options.scheme.requestDecoratorName || 'authCookieCache';

    // generic validateFunc - will be executed on each incoming request
    // for routes configured with the cookie-cache strategy;
    // see hapi-auth-cookie docs for more details about this function

    options.scheme.validateFunc = function (request, cookieObj, callback){

        // cookieObj is an object of the form { uuid: ... } (representation of the cookie);
        // uuid is the key/id of the object previously set in the cache (the 'session' object)

        let isValid = undefined;
        const uuid = cookieObj.uuid;

        // if no uuid, this is an invalid cookie; execute the callback with isValid === false;
        // hapi-auth-cookie will call reply.unstate() and reply.redirect() (if the route config 
        // option config.plugins['hapi-auth-cookie'].redirectTo has been set)

        // for more details check the source of the callback given to validateFunc -
        // https://github.com/hapijs/hapi-auth-cookie/blob/master/lib/index.js

        if (!uuid){
            isValid = false;
            return callback(null, isValid);
        }

        // TODO: if the cookie also had a timestamp of the instant it was created, we could avoid
        // having to do the doing the cache/database lookup for expired sessions (avoid DoS attacks)
        // see https://hueniverse.com/2015/07/08/on-securing-web-session-ids/

        // TODO: for each session object, add a property wich tracks how many times the session
        // has been accessed in the last N seconds (this could be stored in a separate memory-cache)

        internals.policies[options.policy.segment].get(uuid, function (err, value, cached, report) {

            // catbox failed to retrieve the cached data due to some internal error; execute the 
            // callback with error; hapi will do as before - reply.unstate() and reply.redirect()
            // (if redirectTo was defined)
            if (err) {
                return callback(err);
            }

            // the cached object does not exist or is expired; execute the callback with 
            // isValid === false; hapi will do as before - reply.unstate() and reply.redirect()
            // (if redirectTo was defined)

            // note: value === cached.item
            if (!cached) {
                isValid = false;
                return callback(null, isValid);
            }

            // if we arrived here, there is some object in the cache whose key is the uuid
            // given by the cookie (the 'credentials' object previously cached); this means 
            // the user is authenticated;

            // in the request handler we will have access to both the cookie data and the cached object
            // - the cookie data object: available at request.auth.artifacts
            // - the cached object: available at request.auth.credentials
            // (see the call to reply.continue at the end of the callback given to validateFunc)

            isValid = true;
            return callback(null, isValid, value);
        });

    };

    server.auth.strategy(options.strategyName, 'cookie', false, options.scheme);


    // route where the user/password data is sent to

    server.route({
        path: options.loginDataPath,
        method: 'POST',
        config: {

            handler: function (request, reply) {

                // TODO: handle the case where the request is already authenticated?
                /*
                if (request.auth.isAuthenticated) {
                    return reply('You are being redirected...').redirect(...);
                }
                */

                options.validateLoginData(request, function (err, isValid, credentials, redirectTo){

                    // err should be a Boom instance (Boom.unauthorized)
                    if (err){
                        return reply(err);
                    }

                    if (typeof redirectTo === 'string' && redirectTo.trim().length === 0) {
                        return reply(Boom.badImplementation('redirectTo cannot be an empty string'));
                    }

                    if (!isValid){
                        if (typeof redirectTo !== 'string') {
                            return reply(Boom.unauthorized(null, 'cookie'));
                        }
                        else {
                            return reply('You are being redirected...').redirect(redirectTo);    
                        }
                    }

                    // authentication succeeded; we will need the redirectTo argument below
                    if (typeof redirectTo !== 'string' || (typeof redirectTo === 'string' && redirectTo.trim().length === 0)) {
                        return reply(Boom.badImplementation('redirectTo must be a non-empty string'));
                    }

                    // 1) set the data object in the internal cache
                    const uuid = UUID.v4();

                    internals.policies[options.policy.segment].set(

                        // key/id - 'the unique item identifier (within the policy segment)'
                        uuid,

                        //  value (to be stored in the cache)
                        credentials || {},

                        // ttl - 'set to 0 to use the caching rules from the Policy initial configuration' ('expiresIn')
                        0,

                        function (err){

                            if (err) {
                                return reply(err);
                            }

                            // 2) set the cookie data (sent to the client); it will be an object containing 
                            // only the uuid of the cached object (the 'session id', like a foreign key in SQL);
                            request[options.scheme.requestDecoratorName].set({ uuid: uuid });

                            return reply('You are being redirected...').redirect(redirectTo);
                        }
                    );
                });
            },

            auth: {
                strategy: options.strategyName,
                mode: 'try'
            },

            // avoid the redirectTo option (here and in the options for the scheme); 
            // the redirection can be done directly in the handler
            
            /* 
            plugins: {
                'hapi-auth-cookie': {
                    redirectTo: ...
                }
            }
            */

        }
    });


    // logout route

    server.route({
        path: options.logoutPath,
        method: 'GET',
        config: {

            handler: function (request, reply){

                let redirectTo;
debugger
                if (typeof options.logoutRedirectTo === 'string') {
                    redirectTo = options.logoutRedirectTo.trim();
                }

                // override with the query string, is present
                if (typeof request.query.logoutRedirectTo === 'string' && request.query.logoutRedirectTo.trim() !== '') {
                    redirectTo = request.query.logoutRedirectTo.trim();
                }

                // don't handle this case here; proceed to call .drop and make the redirection in the callback
                // to .drop (either directly or via calling options.logoutRedirectTo, if it is a function)

                /* 
                if (!request.auth.isAuthenticated){
                    request[options.scheme.requestDecoratorName].clear();
                    return reply('You are being redirected...').redirect(redirectTo);
                }
                */

                let uuid = '';

                // if the request has been authenticated, request.auth.artifacts will have the cookie data
                if (request.auth.artifacts){
                    uuid = request.auth.artifacts.uuid;
                }

                // make sure we actually have a potential valid key (non-empty string) before calling .drop,
                // otherwise we get an error in the callback to .drop
                if (typeof uuid !== 'string' || uuid.length === 0){
                    request[options.scheme.requestDecoratorName].clear();

                    if (typeof options.logoutRedirectTo === 'function') {
                        return options.logoutRedirectTo(request, reply);
                    }
                    else {
                        return reply('You are being redirected...').redirect(redirectTo);
                    }
                }

                internals.policies[options.policy.segment].drop(uuid, function (err){

                    // clear the cookie even if there is some internal error from catbox
                    // (we might end up with some 'orphan' data in the cache, but it will
                    // eventually be deleted when it expires); however the client will
                    // experience a proper logout (because the cookie will be deleted)
                    request[options.scheme.requestDecoratorName].clear();

                    if (err){
                        return reply(err);
                    }

                    if (typeof options.logoutRedirectTo === 'function') {
                        return options.logoutRedirectTo(request, reply);
                    }
                    else {
                        return reply('You are being redirected...').redirect(redirectTo);    
                    }
                    
                });
            },

            auth: {
                strategy: options.strategyName,
                mode: 'try'
            },


            // avoid the redirectTo option (here and in the options for the scheme); 
            // the redirection can be done directly in the handler
            
            /* 
            plugins: {
                'hapi-auth-cookie': {
                    redirectTo: ...
                }
            }
            */

        }
    });



    // testing

    server.route({
        method: 'GET',
        path: '/test-1',
        handler: function (request, reply) {

            console.log('/test-1');


            const html = `
                <html><body>

                    <h1>test-1</h1>
                    
                </body></html>
            `;
            
            return reply(html);
        },

    });


    server.ext({
        type: 'onPreHandler',
        method: function(request, reply) {

            console.log('onPreHandler b ', request.path);
            return reply.continue();
        },
        options: {
            sandbox: 'connection'
        }
    });

    server.ext({
        type: 'onPreHandler',
        method: function(request, reply) {

            console.log('onPreHandler c ', request.path);
            return reply.continue();
        },
        options: {
            sandbox: 'plugin'
        }
    });


    server.route({
        method: 'GET',
        path: '/test-2',
        handler: function (request, reply) {

            console.log('/test-2');


            const html = `
                <html><body>

                    <h1>test-2</h1>
                    
                </body></html>
            `;
            
            return reply(html);
        },

    });

    return next();

};

exports.register.attributes = {
    name: 'hapi-auth-cookie-cache',
    multiple: true,
    dependencies: ['hapi-auth-cookie']
};

