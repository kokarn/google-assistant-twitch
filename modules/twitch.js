const https = require( 'https' );
const querystring = require( 'querystring' );

const m3u8Parser = require( 'm3u8-parser' );

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
            } else if ( path.indexOf( 'kraken' ) > -1 ){
                requestOptions.headers.Authorization = `OAuth ${ this.accessToken }`;
            } else {
                requestOptions.path = `${ requestOptions.path }?client_id=${ this.clientId }`;
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

    getShortGameName ( gameName ) {
        switch ( gameName ) {
            case 'Counter-Strike: Global Offensive':
                return 'CSGO';
            case 'PLAYERUNKNOWN\'S BATTLEGROUNDS':
                return 'PUBG';
            case 'Super Smash Bros. for Wii U':
                return 'Smash 4';
            default:
                return gameName;
        }
    }

    getStreams ( channel ) {
        return new Promise( ( resolve, reject ) => {
            const formattedChannel = channel.toLowerCase();
            this.request( `/api/channels/${ formattedChannel }/access_token` )
                .then( ( channelResponse ) => {
                    const playlistUrl = `https://usher.ttvnw.net/api/channel/hls/${ formattedChannel }.m3u8?player=twitchweb&token=${ channelResponse.token }&sig=${ channelResponse.sig }&allow_audio_only=true&allow_source=true&type=any&p=${ Math.floor( Math.random() * 999999 ) }`;

                    https.get( playlistUrl, ( response ) => {
                        response.setEncoding( 'utf8' );
                        const parser = new m3u8Parser.Parser();

                        response.on( 'data', ( chunk ) => {
                            parser.push( chunk );
                        } );

                        response.on( 'end', () => {
                            parser.end();

                            let sources = [];
                            let i = 0;

                            for ( let streamType in parser.manifest.mediaGroups.VIDEO ) {
                                let fullQualityName = Object.keys( parser.manifest.mediaGroups.VIDEO[ streamType ] )[ 0 ];

                                if ( !/(\d+P)(\d*)/i.test( fullQualityName ) ) {
                                    console.log( `${ fullQualityName } is not a video quality we understand` );

                                    continue;
                                }

                                let [ full, quality, fps ] = fullQualityName.match( /(\d+P)(\d*)/i );

                                sources.push(
                                    {
                                        quality,
                                        fps,
                                        bitrate: parser.manifest.playlists[ i ].attributes.BANDWIDTH,
                                        uri: parser.manifest.playlists[ i ].uri,
                                    }
                                )

                                i = i + 1;
                            }

                            resolve( sources );
                        } );
                    } );
                } );
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

    getLiveData ( streamId ) {
        let path = `/kraken/streams/?channel=${ encodeURIComponent( streamId ) }`;

        return this.request( path )
            .then( ( response ) => {
                return response.streams[ 0 ];
            } );
    }

    getLiveStreams ( users, streams ) {
        if ( !Array.isArray( users ) ) {
            users = [ users ];
        }
        let userChunk = users.splice( 0, 100 );
        let query = '';

        for ( let i = 0; i < userChunk.length; i = i + 1 ) {

            // Check if it's a number
            if ( !isNaN( userChunk[ i ] ) ) {
                query = `${ query }&user_id=${ userChunk[ i ] }`;
            } else {
                query = `${ query }&user_login=${ userChunk[ i ] }`
            }
        }

        let path = `/helix/streams?first=100&type=live${ query }`;

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
        let query = `login=${ users }`;

        if ( Array.isArray( users ) ) {
            query = `id=${ users.join( '&id=' ) }`;
        }

        return this.request( `/helix/users?${ query }` )
            .then( ( response ) => {
                return response.data;
            } );
    }
}

module.exports = Twitch;
