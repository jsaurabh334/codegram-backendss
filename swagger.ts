import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'CodeGram API',
    version: '1.0.0',
    description: 'API documentation for the CodeGram social media application for developers.',
  },
  // --- START: UPDATED SERVERS CONFIGURATION ---
  servers: [
    {
      url: 'http://localhost:3001', // REMOVED /api from here
      description: 'Development server'
    }
  ],
  // --- END: UPDATED SERVERS CONFIGURATION ---
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
      },
    }
  },
};

const outputFile = './swagger-output.json';
const endpointsFiles = [
    './src/app.ts'
];

// Generate the OpenAPI specification file
swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(() => {
    console.log("OpenAPI specification file has been generated successfully.");
});
