

const alexaVerifier = require('alexa-verifier');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');

function errorResponse(reason) {
  return {
    version: '1.0',
    response: {
      shouldEndSession: true,
      outputSpeech: {
        type: 'PlainText',
        text: reason || 'An unexpected error occurred. Please try again later.'
      }
    }
  };
}

let assistant;
let context;

function verifyFromAlexa(args, rawBody) {
  return new Promise(function(resolve, reject) {
    const certUrl = args.__ow_headers.signaturecertchainurl;
    const signature = args.__ow_headers.signature;
    alexaVerifier(certUrl, signature, rawBody, function(err) {
      console.log('in verify');
      if (err) {
        console.error('err? ' + JSON.stringify(err));
        throw Error('Alexa verification failed.');
      }
      resolve();
    });
    console.log('Verified');
  });
}

function initClients(args) {
  // Connect a client to Watson Assistant
  assistant = new AssistantV2({
    version: '2020-04-01',
    authenticator: new IamAuthenticator({
      apikey: args.ASSISTANT_APIKEY,
     }),
    url: 'https://gateway.watsonplatform.net/assistant/api',
  });

  console.log('Connected to Watson Assistant');
}

function createSessionID(skillId)
{
  console.log('In create session');
  return new Promise(function(resolve, reject)
  {
    assistant.createSession(
    {
      assistantId: skillId
    })
    .then(res =>
    {
      console.log('Created session');
      session_identifier = JSON.stringify(res.result.session_id, null, 2);
      console.log(session_identifier);
      session_json = res;
      console.log(session_identifier);
      console.log(JSON.stringify(session_json, null, 2));
      resolve(session_json);
    })
    .catch(err => {
      console.log(err);
    });
  });
}

function assistantMessage(request, skillId) {
  return new Promise(function(resolve, reject) {
    let input = request.intent ? request.intent.slots.EveryThingSlot.value : 'start skill';
    console.log('SKILL_ID: ' + skillId);
    console.log('Input text: ' + input);

    assistant.message(
      {
        input:
        {
          'message_type': 'text',
          'text': input
        },
        assistantId: skillId,
        sessionId: session_json.result.session_id
      },
      function(err, watsonResponse) {
        if (err) {
          console.error(err);
          reject(Error('Error talking to Watson.'));
        } else {
          // console.log('Watson result: ', watsonResponse.result);
          context = watsonResponse.result.context; // Update global context
          resolve(watsonResponse);
        }
      }
    ).then(res => {
      console.log("Res: ", JSON.stringify(res.result, null, 2));
    })
    .catch(err => {
      console.log(err);
    });
  });
}

function sendResponse(response, resolve) {
  console.log('Begin sendResponse');
  console.log(response);

  // Combine the output messages into one message.
  const output = response.result.output.generic[0].text;
  console.log('Output text: ' + output);

  // Resolve the main promise now that we have our response
  resolve({
    version: '1.0',
    response: {
      shouldEndSession: false,
      outputSpeech: {
        type: 'PlainText',
        text: output
      }
    },
    sessionAttributes: { watsonContext: context }
  });
}

function main(args) {
  console.log('Begin action');
  // console.log(args);
  return new Promise(function(resolve, reject) {
    if (!args.__ow_body) {
      return reject(errorResponse('Must be called from Alexa.'));
    }

    const rawBody = Buffer.from(args.__ow_body, 'base64').toString('ascii');
    const body = JSON.parse(rawBody);

    // Alexa attributes hold our context
    const alexaAttributes = body.session.attributes;
    console.log('Alexa attributes:');
    console.log(alexaAttributes);
    if (typeof alexaAttributes !== 'undefined' && Object.prototype.hasOwnProperty.call(alexaAttributes, 'watsonContext')) {
      context = alexaAttributes.watsonContext;
      console.log("Using watson context");
    } else {
      context = {};
    }
    console.log('Context: ' + context);

    const request = body.request;
    console.log(request);

    verifyFromAlexa(args, rawBody)
      .then(() => initClients(args))
      .then(() => createSessionID(args.SKILL_ID))
      .then(() => assistantMessage(request, args.SKILL_ID))
      .then(watsonResponse => sendResponse(watsonResponse, resolve))
      .catch(err => {
        console.error('Caught error: ');
        console.log(err);
        reject(errorResponse(err));
      });
  });
}

exports.main = main;
