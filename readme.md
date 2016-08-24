# hapi-auth-cookie-memory

## Introduction 

This hapijs plugin combines hapi-auth-cookie and hapi's native caching capabilities (providede by catbox) to provide a simple way authentication system to a hapijs application.

## Description

Assumptions / dependencies:

a) hapi-auth-cookie
The hapi-auth-cookie authentication scheme must been registered before this plugin
b) catbox client
The server must have an instance of some catbox client (using 'catbox-memory' for instance, which is part of hapi core)

When this plugin is registered it will do the following:

- Create an authentication strategy using the "cookie" authentication scheme (which is the scheme provided by the hapi-auth-cookie). Options can be given in the plugin option 'strategy' (an object). 
- Create a catbox policy using the catbox client given in the options. Options can be given in the plugin option 'policy' (an object).
- Create 2 routes:
    - One route to handle the login data (usually the username and password) that should be sent though a form. This route has method POST and the path must be given in the plugin option 'loginDataPath'.
    - One route to handle the logout procedure, which means deleting the cookie and the respective entry in the cache. This route has method GET and the path must be given in the plugin option 'logoutPath'.

After the login data is sent to 'loginDataPath', the handler will execute the function given in the plugin option 'validateLoginData'. This function has signature `function(request, next)`, so the login data is available at `request.payload`. The authentication logic must be implemented here. 

If it succeeds, the `next` callback should be called with `next(null, cacheMe)`, where `cacheMe` is the value to be stored in the cache (usually an object with details about the user, such the username, email, etc).

If the authentication fails, the `next` callback should be called with an error.


## Options



in the main configuration of the server, provide options to create a new catbox client (using, for instance, the "catbox-memory" strategy)

```js
    server: {

        cache: {
            name: "sessionCache",
            engine: require("catbox-memory"),
            partition: "sessionCachePartition"
        }
```

this plugin will do 2 things:

a) create a catbox policy using the one of the catbox client previously configured
b) create an authentication strategy using the "cookie" scheme (provided by the hapi-auth-cookie plugin)


options:

    // catbox policy options; this object will be given directly to server.cache
    // http://hapijs.com/api#servercacheoptions
    policy: {
        cache - the name of the catbox client given above
        segment - the name of the segment to be used in the catbox policy (default: sessionCacheSegment)

    },

    // authentication strategy options:
    http://hapijs.com/api#serverauthstrategyname-scheme-mode-options
    strategy: {
        name:
        mode: 
        scheme: {
            password: ...,
            isSecure: ...,    
        }

        
    },
    loginPath
    logoutPath
    validateLoginData
    successRedirectTo




1) 
a POST request is made to options.loginPath;

options.validateLoginData is executed and is given the request object and a callback.

validateLoginData should implement the logic to verify if the data sent in the request (via query string, form data, custom headers, etc) is correct; this will probably involve a call to the database;

if it is not correct, execute the callback with a Boom.unauthorized object in the 1st arg; otherwise, execute the callback with the session data in the 2nd arg; 

this session data will be stored in the cache using catbox's 'set' method ('sessionCache.set'); the corresponding key will be a uuid generated on the fly (note: this key is not the cookie's key);

the cookie data is just an object with the uuid relative to the session:
{"uuid":"92f987f7-c4c9-4a7b-abf8-84cc4fbb35ad"}
it is set with the 'request.cookieAuth.set' (from hapi-auth-cookie)

finally, the response to the POST request is a 302 redirection to the url given in options.successRedirectTo (done via 'reply.redirect')

2)
on each request that required authentication, the validateFunc defined in the plugin is executed;
this function will be given the cookie data (which has some uuid);

it will try to get the session data from the cache, using sessionCache.get;

if there is an error or if there is no data (because the session migt have expired meanwhile), it will call the callback with false in the 2nd arg; this will make the hapi-auth-cookie plugin clear the cookie;

otherwise, it will call the callback with true in the 2nd arg and the session data in the 3rd arg; this will make the request continue to the next step; at the handler, the session data will be available in request.auth.credentials and the cookie data will be available in request.auth.artifacts

3) 
to logout, simply make a GET request to options.logoutPath;

it will drop the session data from the cache with sessionCache.drop;

it will clear the cookie with request.cookieAuth.clear

the response is a 302 redirection to the url given in options.loginPath (done via 'reply.redirect'), that is, send the user back to the login form page
