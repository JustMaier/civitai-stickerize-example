import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		version: {
			pollInterval: 60000 // Check for updates every 60 seconds
		},
		serviceWorker: {
			register: false // We register manually with type:'module' for dev
		}
	}
};

export default config;
