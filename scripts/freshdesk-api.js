const fetch = require('node-fetch');

/**
 * @typedef {object} ScratchFreshdeskError
 * @extends {Error}
 * @property {number} code - The HTTP status code of the error
 * @property {string} retryAfter - The number of seconds to wait before retrying (TODO: not used?)
 */

/**
 * @typedef {object} FreshdeskCategory
 * @property {number} id - The Freshdesk category ID
 * @property {string} name - The name of the category
 * @property {string} description - The description of the category
 * @property {number[]} visible_in_portals - The portals where the category is visible
 * @property {string} created_at - The creation date of the category
 * @property {string} updated_at - The last update date of the category
 */

/**
 * @typedef {object} FreshdeskFolder
 * @property {number} id - The Freshdesk folder ID
 * @property {string} name - The name of the folder
 * @property {string} description - The description of the folder
 * @property {number} parent_folder_id - The parent folder ID
 * @property {object[]} hierarchy - Parent category and folders in which the folder is placed
 * @property {number} articles_count - The number of articles in the folder
 * @property {number} sub_folders_count - The number of sub-folders in the folder
 * @property {number} visibility - The visibility code of the folder (see docs)
 * @property {number[]} company_ids - The company IDs that can see the folder
 * @property {number[]} contact_segment_ids - The contact segment IDs that can see the folder
 * @property {number[]} company_segment_ids - The company segment IDs that can see the folder
 * @property {string} created_at - The creation date of the folder
 * @property {string} updated_at - The last update date of the folder
 */

/**
 * @typedef {object} FreshdeskArticle
 * @property {number} id - The Freshdesk article ID
 * @property {number} agent_id - The agent ID of the article author
 * @property {number} category_id - The category ID of the article
 * @property {string} description - The description of the article
 * @property {string} description_text - The description of the article in plain text
 * @property {string} folder_id - The folder ID of the article
 * @property {object[]} hierarchy - Parent category and folders in which the article is placed
 * @property {number} hits - The number of hits the article has received
 * @property {number} status - The status code of the article (see docs)
 * @property {[]} seo_data - The SEO metadata of the article (TODO: type?)
 * @property {string[]} tags - The tags of the article
 * @property {number} thumbs_down - The number of thumbs down the article has received
 * @property {number} thumbs_up - The number of thumbs up the article has received
 * @property {string} title - The title of the article
 * @property {string} created_at - The creation date of the article
 * @property {string} updated_at - The last update date of the article
 */

/**
 * Interface to FreshDesk Solutions (knowledge base) api
 * @see https://developers.freshdesk.com/api/
 */
class FreshdeskApi {

    /**
     * Create a new FreshdeskApi instance. Does not connect to the API.
     * @param {string} baseUrl - The base URL of the Freshdesk instance, like 'https://<yourdomain>.freshdesk.com'.
     * @param {string} apiKey - Your Freshdesk API key / token.
     */
    constructor (baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this._auth = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64');
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': this._auth
        };
        this.rateLimited = false;
    }

    /**
     * Checks the status of a response. If status is not ok, or the body is not json raise exception
     * @param {fetch.Response} res The response object
     * @returns {fetch.Response} the response if it is ok
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    checkStatus (res) {
        if (res.ok) {
            if (res.headers.get('content-type')?.startsWith('application/json')) {
                return res;
            }
            throw new Error(`response not json: ${res.headers.get('content-type')}`);
        }
        /** @type {ScratchFreshdeskError} */
        let err = new Error(`response ${res.statusText}`);
        err.code = res.status;
        if (res.status === 429) {
            err.retryAfter = res.headers.get('Retry-After');
        }
        throw err;
    }

    /**
     * List all Solution Categories
     * @returns {Promise<FreshdeskCategory[]>} A promise that resolves to an array of FreshdeskCategory objects
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    async listCategories () {
        return this.checkStatus(
            await fetch(`${this.baseUrl}/api/v2/solutions/categories`, {headers: this.defaultHeaders})
        ).json();
    }

    /**
     * @param {FreshdeskCategory} category List folders in this category
     * @returns {Promise<FreshdeskFolder[]>} A promise that resolves to an array of FreshdeskFolder objects
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    async listFolders (category) {
        return this.checkStatus(
            await fetch(
                `${this.baseUrl}/api/v2/solutions/categories/${category.id}/folders`,
                {headers: this.defaultHeaders}
            )
        ).json();
    }

    /**
     * @param {FreshdeskFolder} folder List articles in this folder
     * @returns {Promise<FreshdeskArticle[]>} A promise that resolves to an array of FreshdeskArticle objects
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    async listArticles (folder) {
        return this.checkStatus(
            await fetch(
                `${this.baseUrl}/api/v2/solutions/folders/${folder.id}/articles`,
                {headers: this.defaultHeaders}
            )
        ).json();
    }

    /**
     * Update the translation for a category
     * @param {number|string} id The Freshdesk category ID
     * @param {string} locale The locale code, like 'en' or 'fr'
     * @param {object} body The translations to send to Freshdesk
     * @returns {Promise<fetch.Response>|-1} A promise that resolves to the response from Freshdesk
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    updateCategoryTranslation (id, locale, body) {
        if (this.rateLimited) {
            process.stdout.write(`Rate limited, skipping id: ${id} for ${locale}\n`);
            return -1;
        }
        return fetch(
            `${this.baseUrl}/api/v2/solutions/categories/${id}/${locale}`,
            {
                method: 'put',
                body: JSON.stringify(body),
                headers: this.defaultHeaders
            })
            .then(this.checkStatus)
            .then(res => res.json())
            .catch((err) => {
                if (err.code === 404) {
                    // not found, try create instead
                    return fetch(
                        `${this.baseUrl}/api/v2/solutions/categories/${id}/${locale}`,
                        {
                            method: 'post',
                            body: JSON.stringify(body),
                            headers: this.defaultHeaders
                        })
                        .then(this.checkStatus)
                        .then(res => res.json());
                }
                if (err.code === 429) {
                    this.rateLimited = true;
                }
                process.stdout.write(`Error processing id ${id} for locale ${locale}: ${err.message}\n`);
                throw err;
            });
    }

    /**
     * Update the translation for a folder
     * @param {number|string} id The Freshdesk folder ID
     * @param {string} locale The locale code, like 'en' or 'fr'
     * @param {object} body The translations to send to Freshdesk
     * @returns {Promise<fetch.Response>|-1} A promise that resolves to the response from Freshdesk
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    updateFolderTranslation (id, locale, body) {
        if (this.rateLimited) {
            process.stdout.write(`Rate limited, skipping id: ${id} for ${locale}\n`);
            return -1;
        }
        return fetch(
            `${this.baseUrl}/api/v2/solutions/folders/${id}/${locale}`,
            {
                method: 'put',
                body: JSON.stringify(body),
                headers: this.defaultHeaders
            })
            .then(this.checkStatus)
            .then(res => res.json())
            .catch((err) => {
                if (err.code === 404) {
                    // not found, try create instead
                    return fetch(
                        `${this.baseUrl}/api/v2/solutions/folders/${id}/${locale}`,
                        {
                            method: 'post',
                            body: JSON.stringify(body),
                            headers: this.defaultHeaders
                        })
                        .then(this.checkStatus)
                        .then(res => res.json());
                }
                if (err.code === 429) {
                    this.rateLimited = true;
                }
                process.stdout.write(`Error processing id ${id} for locale ${locale}: ${err.message}\n`);
                throw err;
            });
    }

    /**
     * Update the translation for an article
     * @param {number|string} id The Freshdesk article ID
     * @param {string} locale The locale code, like 'en' or 'fr'
     * @param {object} body The translations to send to Freshdesk
     * @returns {Promise<fetch.Response>|-1} A promise that resolves to the response from Freshdesk
     * @throws {ScratchFreshdeskError} if the response is not ok
     */
    updateArticleTranslation (id, locale, body) {
        if (this.rateLimited) {
            process.stdout.write(`Rate limited, skipping id: ${id} for ${locale}\n`);
            return -1;
        }
        return fetch(
            `${this.baseUrl}/api/v2/solutions/articles/${id}/${locale}`,
            {
                method: 'put',
                body: JSON.stringify(body),
                headers: this.defaultHeaders
            })
            .then(this.checkStatus)
            .then(res => res.json())
            .catch((err) => {
                if (err.code === 404) {
                    // not found, try create instead
                    return fetch(
                        `${this.baseUrl}/api/v2/solutions/articles/${id}/${locale}`,
                        {
                            method: 'post',
                            body: JSON.stringify(body),
                            headers: this.defaultHeaders
                        })
                        .then(this.checkStatus)
                        .then(res => res.json());
                }
                if (err.code === 429) {
                    this.rateLimited = true;
                }
                process.stdout.write(`Error processing id ${id} for locale ${locale}: ${err.message}\n`);
                throw err;
            });
    }
}

module.exports = FreshdeskApi;
