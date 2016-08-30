# hapi-auth-cookie-memory

## Introduction 

This hapi plugin combines [`hapi-auth-cookie`](https://github.com/hapijs/hapi-auth-cookie) and hapi's native [caching capabilities](http://hapijs.com/api#servercacheoptions) to provide a simple and reusable authentication system.

## Description

Assumptions / dependencies:

- 'cookie' scheme - the 'cookie' authentication scheme must be registered (this scheme is provided by `hapi-auth-cookie`)
- catbox client - the server must have an instance of some catbox client (could be [catbox-memory](https://github.com/hapijs/catbox-memory) for instance, which is part of hapi core)

When this plugin is registered it will do the following:

- Creates an [authentication strategy](http://hapijs.com/api#serverauthstrategyname-scheme-mode-options) based on the 'cookie' authentication scheme
- Creates a [catbox policy](http://hapijs.com/api#servercacheoptions) using the catbox client previously configured
- Creates 2 routes:
    - One route to handle the submission of the login data (usually the username and password, via an html form)
    - One route to handle the logout procedure (clear the cookie in the client and delete the respective entry in the cache)

In other words, the functionality provided by this plugin consists in the generic components of a simple cookie-based login system (stuff that can be reused).


## Workflow

Suppose the client is not authenticated (is not 'logged in').

#### 1) client visits the login page

The client visit a page with a form that allows to submit the login data (example: 'GET /login'). This route/page must be implemented outside of this plugin.

#### 2) client sends the login data

The login data is POSTed to the path defined in 'loginDataPath' (example: 'POST /login-data'). The validation logic must be implemented in the `validateLoginData` function. This function has signature `function(request, next)`, where the `next` callback has signature `function(err, isValid, data)`.
If you have used other `hapi-auth-*` plugins, this should look familiar.

If the submitted login data is valid, `next` should be called as `next(null, true, data)`, where `data` is the 'credentials' object (or 'session' object), that is, an object containing authentication information about the client that will be available in subsequent requests.

That object will be stored in the cache and the respective uuid will be present in a cookie that is sent back to the client. The response will be a 302 redirection to the path given in `loginRedirectTo` (which is usually a page with private contents, for instance, '/dashboard').

If the submitted login data is not valid, `next`  should be called as `next(null, false, redirectTo)`, where `redirectTo` is an optional string with an url. If `redirectTo` is given, the response will be 302 redirection to that url (which usually is the path of the login page - we want to give an immediate new opportunity for the client to submit the login data). If `redirectTo` is not given, the response will be a simple 401 error.

#### 3) client can access protected routes

If the submitted login data was valid, the client is now authenticated. The requests to routes protected with the 'cookie-cache' strategy (which is the default name for the strategy) will now reach the handler and the session data is available in `request.auth.credentials`.

If authentication fails for some reason (for instance, the session data might have expired, see below) and if the route configuration uses auth mode 'try', the handler is still executed. In that case we have `request.auth.isAuthenticated` false and there is no session data in `request.auth.credentials`.

Note: a request to a protected route will execute the `validateFunc` option given to `hapi-auth-cookie`. This function is implemented directly by this plugin and has a generic logic to interact with the cache:
- retrieve the session object from the cache (the cache key is the uuid given by the cookie)
- if the object doesn't exist or has expired, authentication fails; execute the callback passed to `validateFunc` with false in the 2nd parameter (which results in `hapi-auth-cookie` clearing the cookie, if it exists)
- if the object exists in the cache and is not expired, authentication succeeds; execute the callback with true in the 2nd parameter and the object in the 3rd (in the handler the object will be available at `request.auth.credentials`);

#### 4) client logs out

The client makes a GET request to the path defined in 'logoutPath' (example: 'GET /logout'). The handler will clear the cookie and delete the entry in the cache. The response is a 302 redirection to the path given in `logoutRedirectTo` (usually the login page or the homepage).


#### Notes

- In step 1), the handler for the '/login' route should have a guard clause to check if the client is already authenticated when that page is requested, and if so respond with a redirection to the path given in `loginRedirectTo` (see the section [Redirection flow from /login to /dashboard](#https://github.com/paulovieira/hapi-auth-cookie-cache#redirection-flow-from-login-to-dashboard)). 
- In step 2), a similar guard is implemented by the plugin: if the client is already authenticated when the login data is sent (this could happen if the login data was already sent in another tab), the response will be a 302 redirection to the path given in `loginRedirectTo`.
- For routes defined by the user (`loginRedirectTo`, `logoutRedirectTo`, and others...), avoid using the `redirectTo` option in `hapi-auth-cookie` (both in the options for scheme and in the route options for plugin). It can cause 302 redirection loops in some cases. The simpler combination is to use auth mode 'try' and not use `redirectTo` (redirections can be done directly in the handler).

## Options

- `policy` - required object with options for the catbox policy
- `scheme` - object with options for the 'cookie' scheme (implemented by `hapi-auth-cookie`)
- `strategyName` - string with the name of the strategy (default: 'cookie-cache')
- `loginDataPath` - string with the path of the route to where the login data should be submitted to. A POST route will be created with this path. Example: '/login-data'.
- `loginRedirectTo` - string with the path to be used in the redirection after the login process is finished with success. Example: '/dashboard'.
- `logoutPath` - string with the path of the route to log out the client. A GET route will be created with this path. Example: '/logout'.
- `logoutRedirectTo` - string with the path to be used in the redirection after the logout process is finished. Example: '/'.or '/login'.
- `validateLoginData` - function with signature `function(request, next)` that is called by the plugin after the client has submitted the login data (making a POST request to the path defined in `loginDataPath`). 
If the login data was submitted using an html form, it will be available in `request.payload`. If it is valid, `next` should be called as `next(null, true, data)`, where `data` is the 'credentials' object (or the 'session' object) that will be stored in the cache. The response will be a 302 redirection to the path given in `loginRedirectTo` (which is usually a page with private contents, for instance, '/dashboard')
If the login data is not valid, `next` should be called as `next(null, false, redirectTo)` where `redirectTo` is an optional string with an url. If given, the response will be 302 redirection to that url. If not given, the response will be a simple 401 error.



## Differences to the hapi-auth-cookie plugin

In `hapi-auth-cookie` the `validateFunc` is where the control is given to the user (to validate the cookie data, interact with the cache/database, etc).

In `hapi-auth-cookie-cache` the `validateFunc` is already provided and implements a generic logic which can be abbreviated in the following way: if there is a session object in the cache corresponding to the uuid present in the cookie, then the request is authentic.

In `hapi-auth-cookie-cache` the control is given to the user in the `validateLoginData`, which has similar semantics to the `validateFunc`.


## Reasons for authentication failure (in step 3)

Suppose a client is already authenticated and a request is made to an endpoint configured with the 'cookie-cache' auth strategy. 
The authentication can fail for different reasons:

#### 1) There is no cookie 

This happens when the cookie has expired or has been manually deleted by the client. `hapi-auth-cookie` will then call `unauthenticated`, which calls the reply interface with an error.

#### 2) The cookie has been tampered

This is equivalent to case 1) because when the cookie data is decrypted (by the 'iron' module) there will be an error. The object `request.state` won't have any value for that cookie key, so the code proceeds exactly as in the above case. 

In this case the cookie will also be deleted in the client if the option `scheme.clearInvalid` is true (there is a call to `request._clearState`  somewhere in hapi core).

#### 3) The cookie is valid but the uuid doesn't correspond to any value in the cache

When we try to get the cached value (using the internal catbox policy in `validateFunc`), the value will be undefined. The callback to `validateFunc` is called with false in the 2nd argument. 
'hapi-auth-cookie' will then call `unauthenticated`, so the code proceeds as in the above cases. 

In this case the cookie will also be deleted in the client if the option `scheme.clearInvalid` is true (there is a call to `reply.unstate`  just before the call to `unauthenticated`).

#### 4) The cookie is valid and there is a corresponding value in the cache, but it has expired

Similar to the previous case: when we try to get the cached value (in `validateFunc`) the value will be undefined.

#### Notes

- An expired value in the cache might or might not be deleted in the database/store. In principle it should be, but that's a concern of the catbox client being used to interface with that database. However when we try to get the value using the catbox policy method 'get', the argument in the callback will be null.
- If there is some internal error when obtaining the value from the cache, the callback to `validateFunc` will be called with that error and `hapi-auth-cookie` will execute the same steps as in case 3.

**Conclusion:** in all 4 cases the cookie will be cleared in the client (if it exists and if the option `scheme.clearInvalid` is set). The response should be a 302 redirection (defined in the handler, which should check `request.auth.isAuthenticated`).


## Redirection flow from '/login' to '/dashboard'

There is a sort of 'inverse' relation betweet the '/login' and the '/dashboard' routes, depending on whether the client is authenticated or not.

#### 1) if client IS authenticated
- GET /login -  should redirect to /dashboard
- GET /dashboard - should complete the request (show the page, send the payload, etc)

#### 2) if client IS NOT authenticated
- GET /login - should complete the request (show the page)
- GET /dashboard - should redirect to /login

Looking at it in other angle:

#### 3) for the /login route
- if the client IS authenticated - should redirect to /dashboard
- if the client IS NOT authenticated - should complete the request

#### 4) for the /dashboard route (the inverse)
- if the client IS authenticated - should complete the request
- if the client IS NOT authenticated - should redirect to /login




## register multple times

This plugin can be registered multiple times. This can be used to implement separate login systems in the same app.

The following options must be unique per registration:

- schemeName (default is 'cookie-cache')
- scheme.cookie (default is 'sid')
- scheme.requestDecoratorName (default is 'cookieAuth')

The following options should also probably be unique per registration (altough not technically necessary):
- loginDataPath 
- loginRedirectTo
- logoutPath
- policy.segment (default is 'sessions' - probably makes sense to separate where the sessions)

