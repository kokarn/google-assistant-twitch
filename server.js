const http = require( 'http' );

const express = require( 'express' );
const getUrls = require( 'get-urls' );
const SocketServer = require( 'ws' ).Server;

const Twitch = require( './modules/twitch' );

const app = express();
const server = http.createServer( app );
const wss = new SocketServer( {
    server
} );
const twitch = new Twitch( process.env.CLIENT_ID, process.env.CLIENT_SECRET );
const DEFAULT_PORT = 3000;

// 18181682

const sendMessage = function sendMessage ( type, content ) {
    wss.clients.forEach( ( client ) => {
        client.send( JSON.stringify( {
            type: type,
            content: content,
        } ) );
    } );
}

app.get( '/playing/:streamName', ( request, response ) => {
    twitch.getLiveData( request.params.streamName )
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
                return dataset.display_name;
            } );

            let message = `Currently live is ${ liveStreams.splice( 0, 15 ).join( ', ' ) }`;

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
