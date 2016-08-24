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

### Execute login/authentication logic - validateLoginData

After the login data is sent by the client to the url defined in 'loginDataPath', the handler (defined by the plugin) will execute the function given in the plugin option 'validateLoginData'. This function has signature `function (request, next)`, so the login data is available at `request.payload`. The authentication logic must be implemented here. 

If it succeeds, the `next` callback should be called with `next(null, cacheMe)`, where `cacheMe` is a value to be stored in the cache. This is usually an object with some details about the user that have been retrieved from a database, such the username, email, etc. A cookie will also be sent to the client containing just the uuid of the cached value.

If the authentication fails, the `next` callback should be called with a Boom error as the 1st argument (Boom.unauthorized would be correct choice). Optionally the plugin can also reply with a redirect (see below).

### Execute logout logic 

To log out the client, a GET request must be done to the path given in the 'logoutPath' option. The handler will delete the valued previously stored in the cache and clear the cookie. The reply will always be a redirect to the path given in the option 'logoutRedirectTo' (usually either the homepage or the page with the login form).

## Flow

Suppose the client is not authenticated (is not 'logged in').

1) The client visit a page that has a form to send the login data (example: 'GET /login').

2) The login data is POSTed to the path defined in 'loginDataPath' (example: 'POST /login-data'). The authentication logic must be implemented in the 'validateLoginData' function, which receives the request object in the first argument and a 'next' callback in the second.

If the authentication suceeds, the 'next' callback should be called with an object in the 2nd parameter (object with data about the client):
- That object will be stored in the cache 
- A cookie with the uuid of the cached data is sent to the client in the response
- The response will be a redirection to the path given in 'loginRedirectTo' (usually a page with private contents)

If the authentication fails, the 'next' callback should be called with a Boom error in the 1st parameter
- The response will be a Boom error;
- The response might alternatively be a redirection to some path (if the error has the property 'redirectTo'). Usually this is the path of the login page.

Note: if the client is already authenticated when the login data is sent (this could happen if the login data was sent in another tab by mistake), the response will simply be a redirection to the path given in 'loginRedirectTo'.

3) After the user is authenticated, all requests to paths that implement the 'cookie-cache' strategy 


Note: in step 1, the '/login' route must be defined outside the plugin. The handler should check if the client is already authenticated, and if so reply with a redirection (usually to the path given in 'loginRedirectTo'). That is, if the client is already logged in and tries to visit the page with the login form, the response will be the private page. 
Also, make sure the route option plugins['hapi-auth-cookie'].redirectTo is not defined, otherwise we might end up with an infinite redirection loop (302 replies) if the user is not authenticated..

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
