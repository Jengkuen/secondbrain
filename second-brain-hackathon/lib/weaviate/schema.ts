import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local at the root of the second-brain-hackathon project
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const weaviateUrl = process.env.WEAVIATE_URL;

if (!weaviateUrl) {
  console.error("WEAVIATE_URL environment variable not set!");
  process.exit(1);
}

// Configure the client
// For local dev with docker-compose.yml, anonymous access is enabled.
// If using WCS or requiring authentication, add ApiKey or other auth methods.
const client = weaviate.client({
  scheme: 'http', // Assuming HTTP for local Docker setup
  host: weaviateUrl.replace('http://', '').replace('https://', ''), // Remove scheme if present
});

// --- Define Schemas ---

const interactionClass = {
  class: 'Interaction',
  description: 'Stores chat interactions between user and AI',
  vectorizer: 'text2vec-transformers', // Use the module enabled in docker-compose
  vectorIndexConfig: {
     distance: 'cosine', // Default distance metric
  },
  moduleConfig: {
    'text2vec-transformers': {
      vectorizeClassName: false, // Don't vectorize the class name itself
      poolingStrategy: 'masked_mean',
      // Specify which properties to vectorize (optional, defaults might be okay)
      // properties: ['content']
    }
  },
  properties: [
    {
      name: 'topic',
      dataType: ['text'],
      description: 'User\'s initial prompt or a summary',
      moduleConfig: { 'text2vec-transformers': { skip: true } }
    },
    {
      name: 'content',
      dataType: ['text'],
      description: 'Combined User + AI conversation snippet to be vectorized',
    },
    {
        name: 'userMessage',
        dataType: ['text'],
        description: 'The raw user message (optional)',
        moduleConfig: { 'text2vec-transformers': { skip: true } }
    },
    {
        name: 'aiResponse',
        dataType: ['text'],
        description: 'The raw AI response (optional)',
        moduleConfig: { 'text2vec-transformers': { skip: true } }
    },
    {
      name: 'timestamp',
      dataType: ['date'],
      description: 'Timestamp of the interaction',
    }
  ]
};

const noteClass = {
    class: 'Note',
    description: 'Stores structured notes extracted from conversations (like Obsidian notes)',
    vectorizer: 'text2vec-transformers',
    vectorIndexConfig: {
       distance: 'cosine',
    },
    moduleConfig: {
      'text2vec-transformers': {
        vectorizeClassName: false,
        poolingStrategy: 'masked_mean',
        // properties: ['content', 'title'] // Vectorize content and title?
      }
    },
    properties: [
      {
        name: 'title',
        dataType: ['text'],
        description: 'The title of the note (e.g., Person name, Event name, Date)',
        tokenization: 'word',
      },
      {
        name: 'entityType',
        dataType: ['text'],
        description: 'Type of note (person, event, journal)',
         tokenization: 'word',
         moduleConfig: { 'text2vec-transformers': { skip: true } }
      },
      {
        name: 'content',
        dataType: ['text'],
        description: 'Main body/summary of the note',
      },
      {
        name: 'rawContexts',
        dataType: ['text[]'], // Array of text
        description: 'Snippets of user messages contributing to this note',
        moduleConfig: { 'text2vec-transformers': { skip: true } } 
      },
      {
        name: 'created',
        dataType: ['date'],
        description: 'Creation timestamp',
      },
      {
        name: 'lastUpdated',
        dataType: ['date'],
        description: 'Last update timestamp',
      },
      {
        // Define the cross-reference property
        name: 'relatedNotes',
        dataType: ['Note'], // Reference the 'Note' class itself
        description: 'Links to other related notes',
      }
    ]
  };


// --- Function to Create Schema ---

async function createSchema() {
  console.log('Connecting to Weaviate at:', weaviateUrl);

  try {
    // Check connection
    const meta = await client.misc.metaGetter().do();
    console.log('Weaviate is ready:', meta.version);

    // Check if Interaction class exists
    try {
        await client.schema.classGetter().withClassName(interactionClass.class!).do();
        console.log(`Class '${interactionClass.class}' already exists.`);
    } catch (e) {
        // Class doesn't exist, create it
        console.log(`Creating class '${interactionClass.class}'...`);
        await client.schema.classCreator().withClass(interactionClass).do();
        console.log(`Class '${interactionClass.class}' created successfully.`);
    }

    // Check if Note class exists
    try {
        await client.schema.classGetter().withClassName(noteClass.class!).do();
        console.log(`Class '${noteClass.class}' already exists.`);
    } catch (e) {
        // Class doesn't exist, create it
        console.log(`Creating class '${noteClass.class}'...`);
        await client.schema.classCreator().withClass(noteClass).do();
        console.log(`Class '${noteClass.class}' created successfully.`);
    }

    console.log('\nSchema setup complete.');

  } catch (err) {
    console.error('\nError during schema creation:');
    console.error(err);
    process.exit(1);
  }
}

// Run the schema creation function
createSchema(); 