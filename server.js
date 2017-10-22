const http = require( 'http' );

const express = require( 'express' );
const getUrls = require( 'get-urls' );
const SocketServer = require( 'ws' ).Server;
const soundFuzzy = require( 'clj-fuzzy' );

const Twitch = require( './modules/twitch' );

const app = express();
const server = http.createServer( app );
const wss = new SocketServer( {
    server
} );
const twitch = new Twitch( process.env.CLIENT_ID, process.env.CLIENT_SECRET );
const DEFAULT_PORT = 3000;
const MAX_STREAMS = 12;
const DICE_LIMIT = 0.5;

let validStreams = [];

const sendMessage = function sendMessage ( type, content ) {
    wss.clients.forEach( ( client ) => {
        client.send( JSON.stringify( {
            type: type,
            content: content,
        } ) );
    } );
};

const findBestMatch = function findBestMatch ( channel ) {
    let parsedChannel = decodeURIComponent( channel ).toLowerCase();
    parsedChannel = parsedChannel.replace( /\s/g, '' );
    let bestMatch = {
        score: 0,
    };


    if ( validStreams[ channel ] ) {
        return channel;
    }

    for ( let i = 0; i < validStreams.length; i = i + 1 ) {
        let score = soundFuzzy.metrics.dice( parsedChannel, validStreams[ i ] );

        if ( score > bestMatch.score ) {
            bestMatch = {
                channel: validStreams[ i ],
                score,
            };
        }
    }

    if ( bestMatch.score > DICE_LIMIT ) {
        return bestMatch.channel;
    }

    return parsedChannel;
};

app.get( '/playing/:streamName', ( request, response ) => {
    const channelName = findBestMatch( request.params.streamName );

    twitch.getLiveData( channelName )
        .then( ( userInfo ) => {
            let message;

            if ( !userInfo ) {
                message = `${ request.params.streamName } doesn't seem to be live at the moment.`;
            } else {
                let displayStatus = userInfo.channel.status;

                const urlsInStatus = getUrls( displayStatus, {
                    normalizeProtocol: false,
                } );

                for ( let url of urlsInStatus ) {
                    displayStatus = displayStatus.replace( url, '' );
                }

                if ( !validStreams[ userInfo.channel.display_name ] ) {
                    validStreams.push( userInfo.channel.display_name.toLowerCase() );
                }

                message = `${ userInfo.channel.display_name } is playing ${ twitch.getShortGameName( userInfo.game ) } titled ${ displayStatus }`;
            }

            sendMessage( 'message', message );
            response.send( message );
        } )
        .catch( ( someError ) => {
            console.error( someError );
        } );
} );

app.get( '/play/:streamName', ( request, response ) => {
    twitch.getStreams( request.params.streamName )
        .then( ( streams ) => {
            sendMessage( 'play', streams );
            response.send( `Playing ${ request.params.streamName }` );
        } )
        .catch( ( someError ) => {
            console.error( someError );
        } );
} );

app.get( '/live/:userId', ( request, response ) => {
    twitch.getFollowers( request.params.userId )
        .then( ( following ) => {
            return twitch.getLiveStreams( following );
        } )
        .then( ( streams ) => {
            let userIds = [];
            let streamMap = {};

            for ( let i = 0; i < streams.length; i = i + 1 ) {
                userIds.push( streams[ i ].user_id );
                streamMap[ streams[ i ].user_id ] = i;
            }

            return twitch.getUserInfo( userIds )
                .then( ( userInfo ) => {
                    let fullData = [];

                    for ( let i = 0; i < userInfo.length; i = i + 1 ) {
                        fullData.push(
                            Object.assign(
                                {},
                                streams[ streamMap[ userInfo[ i ].id ] ],
                                userInfo[ i ]
                            )
                        );
                    }

                    return fullData;
                } );
        } )
        .then( ( completeData ) => {
            completeData.sort( ( a, b ) => {
                if ( a.viewer_count > b.viewer_count ) {
                    return -1;
                } else if ( a.viewer_count < b.viewer_count ) {
                    return 1;
                }

                return 0;
            } );
            const liveStreams = completeData.map( ( dataset ) => {
                if ( !validStreams[ dataset.display_name ] ) {
                    validStreams.push( dataset.display_name.toLowerCase() );
                }

                return dataset.display_name;
            } );

            let message = `Currently live is ${ liveStreams.splice( 0, MAX_STREAMS ).join( ', ' ) }`;

            // Replace final ', ' with ' and ';
            message = message.replace( /, (?=[^,]*$)/, ' and ' );

            sendMessage( 'message', message );
            response.send( message );
        } )
        .catch( ( error ) => {
            console.log( error );
        } );
} );

wss.on( 'connection', ( ws ) => {
    console.log( 'Client connected' );

    ws.on( 'close', () => {
        console.log( 'Client disconnected' );
    } );
} );

server.listen( process.env.PORT || DEFAULT_PORT, () => {
    console.log( 'Google Assistant twitch integration ready to serve on port', process.env.PORT || DEFAULT_PORT );
} );
