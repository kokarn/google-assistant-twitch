const express = require( 'express' );

const Twitch = require( './modules/twitch' );

const app = express();
const twitch = new Twitch( process.env.CLIENT_ID, process.env.CLIENT_SECRET );
const DEFAULT_PORT = 3000;

// 18181682

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
            const liveStreams = completeData.map( ( dataset ) => {
                return dataset.display_name;
            } );

            response.send( liveStreams.join( ', ' ) );
        } )
        .catch( ( error ) => {
            console.log( error );
        } );
} );

app.listen( process.env.PORT || DEFAULT_PORT, () => {
    console.log( 'Google Assistant twitch integration ready to serve on port', process.env.PORT || DEFAULT_PORT );
} );
