// Expose the existing authentication specs to the fixed-source Web release
// builder's *.test.js selector without duplicating their cases or implementation.
import './composables/profileReauthentication.spec.js'
import './composables/apiStoreOauth.spec.js'
import './composables/accountSecuritySession.spec.js'
import './composables/oauthHttpAuth.spec.js'
import './composables/oauthSseAuth.spec.js'
