# hapi-auth-cookie-memory

## Introduction 

This hapi plugin combines [`hapi-auth-cookie`](https://github.com/hapijs/hapi-auth-cookie) and hapi's native [caching capabilities](http://hapijs.com/api#servercacheoptions) to provide a simple and reusable authentication system.

## Description

Assumptions / dependencies:

- 'cookie' scheme - the 'cookie' authentication scheme must be registered (this scheme is provided by [`hapi-auth-cookie`](https://github.com/hapijs/hapi-auth-cookie))
- catbox client - the server must have an instance of some catbox client (could be [catbox-memory](https://github.com/hapijs/catbox-memory) for instance, which is part of hapi core)

When this plugin is registered it will do the following:

- creates an [authentication strategy](http://hapijs.com/api#serverauthstrategyname-scheme-mode-options) based on the 'cookie' authentication scheme
- creates a [catbox policy](http://hapijs.com/api#servercacheoptions) using one of the available catbox clients
- creates 2 routes:
    - one route to handle the submission of the login data (usually the username and password, via an html form)
    - one route to handle the logout procedure (clear the cookie in the client and delete the respective entry in the cache)

In other words, the plugin provides the generic functionality of a simple cookie-based login system.

An application that uses this plugin should implement 2 (or more) protected routes configured with the 'cookie-cache' authentication strategy  (which is the default name of the strategy created by the plugin):

- the login route (example: /login): usually a page with a form to submit the credentials (username/password combination)
- the private route (example: /dashboard): usually a page with dynamic content, specific to each user of the system

## Example

The examples directory has a simple proof-of-concept example that demonstrates how to use the plugin.

## Workflow

This is the typical workflow for the process of "logging in". By "client" it should be understood the "user of the hapi web application".

#### 1) client visits the login page

Suppose the client is not authenticated (is not 'logged in').
The client visits a page with a form that allows to submit the username+password combination (example: GET /login). This route/page must be implemented outside of this plugin.

#### 2) client submits the login data

The login data is POSTed to the path defined in the  `loginDataPath` option (string, default is "/login-data"). The plugin will create a route with this path. 

The validation logic must be implemented in the `validateLoginData` option (function). This function has signature `function (request, next)`, where the `next` callback has signature `function (err, isValid, credentials, redirectTo)`. See the ["options"](#options) section for more details.
If you have used other `hapi-auth-*` plugins, this API should look familiar.

If the submitted login data is valid, `next` should be called as `next (null, true, credentials, redirectTo)`, where:

- `credentials`: is an object that will be available in the request handler in `request.auth.credentials`. Typically this object contains data from the database specific to the user. That object will be stored in the cache and the respective key (a uuid) will be present in the cookie that is sent back to the client. 
- `redirectTo`: the response will be a 302 redirection to the path given in this argument (usually a page with private contents, for instance, /dashboard). This page must be implemented outside of this plugin and should be protected with the 'cookie-cache' authentication strategy.

If the submitted login data is not valid, `next`  should be called as `next (null, false, null, redirectTo)`, where the `redirectTo` argument is again the path to be used in the 302 redirection response, but now should be page that is publicly accessible (example: /login, since we want to give the user a new opportunity to submit the login data).

If the submitted login data is not valid and `next` is called without the `redirectTo` argument, the response will be a simple 401 error (which not helpful at all)

#### 3) client can access protected routes

If the submitted login data was valid, the client is now authenticated. The requests to routes protected with the 'cookie-cache' strategy  will now reach the handler and the data specific to the user is available in `request.auth.credentials`.

If meanwhile the authentication fails for some reason (for instance, the cookies are manually cleared in the client, or the session data might have expired, see below) and if the route configuration uses auth mode 'try', the handler is still executed. In that case we have `request.auth.isAuthenticated` false. The application is responsible to handling these cases (example: redirect to the login page). See the table below.

Note: a request to a protected route will execute the `validateFunc` callback given to `hapi-auth-cookie`, but this function is already implemented by the `hapi-auth-cookie-cache` plugin, so don't use it in the option for `hapi-auth-cookie`. The implementation in `hapi-auth-cookie-cache` will do the following:
- retrieve the 'credentials' object from the cache (the cache key is the uuid stored in the cookie);
- if the object doesn't exist in the cache (or has expired), authentication fails; execute the callback passed to `validateFunc` as `callback (null, false)`, which results in `hapi-auth-cookie` clearing the cookie;
- if the session object exists and has not expired, authentication succeeds; execute the callback passed to `validateFunc` as `callback (null, true, cachedData)`; in the route handler the `cachedData` object will be available in `request.auth.credentials`;

#### 4) client logs out

The client makes a GET request to the path defined in `logoutPath` option (string, default is '/logout').
This is a route created by the plugin.

The handler will clear the cookie and delete the entry in the cache. The response is a 302 redirection to the path given in the `logoutRedirectTo` option (string). This is usually the login page or the homepage. If the request to `logoutPath` has a query string with the `logoutRedirectTo` key, then the query string value will override the `logoutRedirectTo` option. 

Example: a request `GET /logout?logoutRedirectTo=/xyz` will clear the cookie, delete the entry in the cache and redirect to '/xyz' (regardless of the `logoutRedirectTo` option).

For more advanced cases the `logoutRedirectTo` option can also be a function. See below.


## Options

- `policy` - object(required) with options for the catbox policy; will be used in a call to `server.cache`;
- `scheme` - object with options for the 'cookie' auth scheme (the scheme implemented by `hapi-auth-cookie`); will be used in a call to `server.auth.strategy`, which is where `hapi-auth-cookie-cache` creates an auth strategy using the 'cookie' scheme; see also the `strategyName` option below;
- `strategyName` - string with the name of the auth strategy created by `hapi-auth-cookie-cache` (default: 'cookie-cache'); see also the `scheme` option above; 
- `loginDataPath` - string with the path to where the login data should be submitted (default: '/login-data'); a POST route will be created with this path and the `validateLoginData` function (see below) will be called; 
- `validateLoginData` - function with signature `function (request, next)` that is called by the plugin when the client submits the login data (making a POST request to the path defined in `loginDataPath`); if the login data was submitted using an html form, it will be available in `request.payload`.  
    - if the login data is valid, `next` should be called as `next (null, true, credentials, redirectTo)`, where
	    - `credentials`: an object to be stored in the cache and that will available in future requests for routes using the 'cookie-cache' auth strategy (in the route handler, this object will be available in `request.auth.credentials`); typically this object contains data from the database specific to the user. 
	    - `redirectTo`: the response will be a 302 redirection to the path given in this argument (should be a page with private contents, for instance, /dashboard); this page must be implemented outside of this plugin and should be protected with the 'cookie-cache' authentication strategy;
    - if the login data is not valid, `next` should be called as `next (null, false, null, redirectTo)`, where
		- `redirectTo`:  the response will be a 302 redirection to the path given in this argument (should be page that is publicly accessible, for instance, /login - this way we give the user a new opportunity to submit the login data)
- `logoutPath` - string with the path that allows the client to log out (default: '/logout'); a GET route will be created with this path;
- `logoutRedirectTo` - string with the path to be used in the redirect response to a request to `logoutPath` (default: '/'); this option can be dynamically overritten when doing the GET request to `logoutPath` by using a query string with key 'logoutRedirectTo' (see above and see the example);



#### Notes

Avoid using the `redirectTo` option of the `hapi-auth-cookie` plugin. It can cause 302 redirection loops in some cases. The simpler combination is to use auth mode 'try' and send redirection responses directly in the route handler (if necessary).
Note that this `redirectTo` option can be set in 2 places: when doing the plugin registration (where we can give options for the 'cookie' scheme) and in the options for each individual route (in the options relative to plugins).


## Differences to the hapi-auth-cookie plugin

In `hapi-auth-cookie` the `validateFunc` is where the control is given to the user (to validate the cookie data, interact with the cache/database, etc).

In `hapi-auth-cookie-cache` the `validateFunc` is already provided and implements a generic logic which can be abbreviated in the following way: if there is a session object in the cache corresponding to the uuid present in the cookie, then the request is considerer authenticated;

In `hapi-auth-cookie-cache` the control is given to the user in the `validateLoginData`, which has a role similar to the `validateFunc` (but only cares about validating the login data, since the plugin takes care of the interacting with the cache).


## Reasons for authentication failures ([in step 3](#3-client-can-access-protected-routes))

Suppose a client is already authenticated and a request is made to an endpoint configured with the 'cookie-cache' auth strategy. 
The authentication can fail for different reasons:

#### 1) There is no cookie 

This happens when the cookie has expired (the client deletes the cookie) or has been manually deleted by other means. `hapi-auth-cookie` will then call the internal `unauthenticated` function, which calls the reply interface with an error.

#### 2) The cookie value has been tampered

This is equivalent to case 1) because when the cookie data is decrypted (by the 'iron' module) there will be an error. The object `request.state` won't have any value for that cookie key, so the code proceeds exactly as in the above case. 

In this case the cookie will also be deleted in the client if the option `scheme.clearInvalid` is true (there is a call to `request._clearState`  somewhere in hapi core).

#### 3) The cookie is valid but the uuid is not found in the cache

When we try to get the cached value (using the internal catbox policy, in `validateFunc`), the value will be undefined. The callback to `validateFunc` is called with false in the 2nd argument. 
`hapi-auth-cookie` will then call `unauthenticated` and the code proceeds as in the above cases. 

In this case the cookie will also be deleted in the client if the option `scheme.clearInvalid` is true (there is a call to `reply.unstate`  just before the call to `unauthenticated`).

#### 4) The cookie is valid and there is a corresponding value in the store/table, but it has expired

Similar to the previous case: when we try to get the cached value (in `validateFunc`) the value will be undefined. From the point of view of the user of the catbox policy, it's as if there was no value. We can detect this case in the route handler (assuming it has 'try' auth mode) by looking at `request.auth.artifacts`, which should be an object with the form `{ uuid: ...}`. This might be useful to send a message to the user informing about the expiration.


#### Notes

- An expired value in the cache might or might not be deleted in the database/store. In principle it should be, but that's a concern of the catbox client being used to interface with that database (the clean-up might be delayed, for some technical reason). However when we try to get the value using the catbox policy method 'get', the argument in the callback should always be undefined.
- If there is some internal error when obtaining the value from the cache, the callback to `validateFunc` will be called with that error and `hapi-auth-cookie` will execute the same steps as in case 3.

**Conclusion:** in all the 4 cases the cookie will be cleared in the client (if it exists and if the option `scheme.clearInvalid` is set). The response should be a 302 redirection (defined in the handler, which should check `request.auth.isAuthenticated`).


## Redirection flow from /login to /dashboard

There is a natural 'inverse' relation between the responses of the protected routes defined by the application (example: '/login' and '/dashboard'), depending on whether the client is authenticated or not.

The table below summarizes these relations:

|                                   | /login                                                                           | /dashboard |
| :---:                             |     :---:                                                                        |          :---: |
| **request is authenticated**      | response should be a 302 redirection to /dashboard (example: `reply.redirect('/dashboard')`) | response should be the html   |
| **request is not authenticated**  | response should be the html                                                      | response should be a 302 redirection to /login (example: `reply.redirect('/login')`)     |

Note that these responses should be handled by the application.



## register multiple times

This plugin can be registered multiple times. This can be used to implement multiple (independent) login systems in the same app with the 'cookie-cache' strategy.

The following 3 options must be unique per registration:

- `strategyName` (default is 'cookie-cache')
- `scheme.cookie` (default is 'sid')
- `scheme.requestDecoratorName` (default is 'cookieAuth')

And the following options are likely to also be unique per registration (altough not technically necessary):

- `loginDataPath`
- `logoutPath`
- `validateLoginData`
- `policy.segment` (probably makes sense to have a separate store/table for each group of sessions).

