const https = require( 'https' );
const querystring = require( 'querystring' );

const ITEMS_PER_REQUEST = 10;

class Twitch {
    constructor ( clientId, clientSecret ) {
        this.clientId = clientId;
        this.clientSecret = clientSecret,

        this.accessToken = false;
    }

    request ( path ) {
        if ( !this.accessToken ) {
            return this.getToken()
                .then( () => {
                    return this.request( path );
                } );
        }

        return new Promise( ( resolve, reject ) => {
            const requestOptions = {
                headers: {},
                hostname: 'api.twitch.tv',
                path: path,
            };

            if ( path.indexOf( 'helix' ) > -1 ) {
                requestOptions.headers.Authorization = `Bearer ${ this.accessToken }`;
            } else {
                requestOptions.headers.Authorization = `OAuth ${ this.accessToken }`;
            }

            const request = https.request( requestOptions, ( response ) => {
                let body = '';

                if ( response.statusCode !== 200 ) {
                    reject( new Error( `https://api.twitch.tv${ path } failed with ${ response.statusCode }` ) );

                    return false;
                }

                response.setEncoding( 'utf8' );
                response.on( 'data', ( chunk ) => {
                    body = body + chunk;
                } );

                response.on( 'end', () => {
                    resolve( JSON.parse( body ) );
                } );
            } );

            request.end();
        } );
    }

    getToken () {
        return new Promise( ( resolve, reject ) => {
            const requestParams = {
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret,
            };
            const requestOptions = {
                hostname: 'api.twitch.tv',
                path: `/kraken/oauth2/token?${ querystring.stringify( requestParams ) }`,
                method: 'POST',
            };

            const request = https.request( requestOptions, ( response ) => {
                let body = '';

                if ( response.statusCode !== 200 ) {
                    reject( new Error( `Get token failed with ${ response.statusCode }` ) );

                    return false;
                }

                response.setEncoding( 'utf8' );
                response.on( 'data', ( chunk ) => {
                    body = body + chunk;
                } );

                response.on( 'end', () => {
                    const responseData = JSON.parse( body );

                    this.accessToken = responseData.access_token;
                    resolve();
                } );
            } );

            request.end();
        } );
    }

    getUserId ( username ) {
        return this.request( `/helix/users?login=${ username }` );
    }

    getFollowers ( userId, following, cursor ) {
        let path = `/helix/users/follows?first=${ ITEMS_PER_REQUEST }&from_id=${ userId }`;

        if ( cursor ) {
            path = `${ path }&after=${ cursor }`;
        }

        if ( !following ) {
            following = [];
        }

        return this.request( path )
            .then( ( response ) => {
                for ( let i = 0; i < response.data.length; i = i + 1 ) {
                    following.push( response.data[ i ].to_id );
                }

                // Load the next page if we get a full request
                if ( response.data.length === ITEMS_PER_REQUEST ) {
                    return this.getFollowers( userId, following, response.pagination.cursor );
                }

                return following;
            } );
    }

    getLiveStreams ( users, streams ) {
        let userChunk = users.splice( 0, 100 );
        let path = `/helix/streams?first=100&type=live&user_id=${ userChunk.join( '&user_id=' ) }`;

        if ( !streams ) {
            streams = [];
        }

        return this.request( path )
            .then( ( response ) => {
                streams = streams.concat( response.data );

                // Load the next page if we got more users
                if ( users.length > 0 ) {
                    return this.getLiveStreams( users, streams );
                }

                return streams;
            } );
    }

    getUserInfo ( users ) {
        let path = `/helix/users?id=${ users.join( '&id=' ) }`;

        return this.request( path )
            .then( ( response ) => {
                return response.data;
            } );
    }
}

module.exports = Twitch;
