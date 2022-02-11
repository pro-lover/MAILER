require('dotenv').config();

const fs 		= require('fs');
const path 		= require('path');
const del		= require('del');
const gulp		= require('gulp');
const ftp		= require('vinyl-ftp');
//const sass		= require('gulp-sass');
const sass = require('gulp-sass')(require('sass'));
const gutil		= require('gulp-util');
const cache		= require('gulp-cache');
const concat 	= require('gulp-concat');
const htmlmin 	= require('gulp-htmlmin');
const imagemin 	= require('gulp-imagemin');
const inject 	= require('gulp-inject-string');
const gulpinject 	= require('gulp-inject');
const escapeHtml 	= require('escape-html');
const replace		= require('gulp-replace');
const inlineCss		= require('gulp-inline-css');
const rename		= require('gulp-rename');
const template		= require('gulp-template-html');
const browserSync	= require('browser-sync').create();
const nodemailer	= require('nodemailer');
const previewEmail	= require('preview-email');
const cmq 			= require('gulp-get-media-queries');
const gcmq 			= require('gulp-group-css-media-queries');
const inquirer 		= require('inquirer');
const rewriteImagePath = require('gulp-rewrite-image-path');

//const mergeStream 	= require('merge-stream');
//const vinylPaths	= require('vinyl-paths');

// browserSync base directory
// this will be the base directory of files for web preview
// since we are building `index.pug` templates (located in src/emails) to `dist` folder.
const baseDir = './dist';
const previewDir = './preview';
const remoteDir = process.env.JobYear + '/NISSAN/' + process.env.CampaignType.toUpperCase() + '/' + process.env.Jobnumber + '-' + process.env.Name;

let NEW_ENV = {};

/*
 * Preview task.
 * Preview the HTML mailer on your web browser
 *
 */
function updateEnvFileEmailSubject() {

	return gulp.src(['./.env'])
		.pipe( replace(/EmailSubject+=+([\"\w\d\s\'\.\-\"]+)(\")/ig, function(match, p1) {
			if ( NEW_ENV.EmailSubject !== '' ) {
				return 'EmailSubject=' + '"' + NEW_ENV.EmailSubject + '"';
			} else {
				return 'EmailSubject=' + '"' + p1 + '"';
			}
		}))
		.pipe(gulp.dest('./'));
}

/*
 * compile sass to css
 *
 */
function sassCompile() {

	return gulp
        // import all email .scss files from src/scss folder
        // ** means any sub or deep-sub files or folders
        .src('./src/**/*.scss')

        // on error, do not break the process
        .pipe(sass().on('error', sass.logError))

        // output to `src/css` folder
		.pipe(gulp.dest('./src'));
		//.pipe(browserSync.stream());

}

function groupMediaQueries() {

	return gulp
		// import all email .css files from src/css folder
		.src('./src/**/*.css')
        // ** means any sub or deep-sub files or folders
        .pipe(gcmq())
        // output to `src/css` folder
		.pipe(gulp.dest(previewDir));
}

function createMediaQueriesFile() {

	fs.writeFileSync( previewDir + '/style.responsive.css', '' );

	var stringContent = '';

	return gulp
		// import all email .css files from src/css folder
		.src('./src/**/*.css', {
			removeBOM: true
		})
		.pipe(cmq({
			log: true,
			// eslint-disable-next-line camelcase
			use_external: false
		}))
		.pipe(
			replace(/\@media[^{]+\{([\s\S]+?\})\s*\}/ig, function (match) {
				/** /
				console.log({
					'match': match
					//'p1': p1,
					//'offset': offset,
					//'string': string
				});
				/**/

				if ( match ) {
					stringContent = stringContent + match;

					fs.appendFileSync( previewDir + '/style.responsive.css', match);

					return match;

				} else {
					return false;
				}

			})
		)
		.pipe(gcmq())
		.pipe(gulp.dest(previewDir));

}

/**
 * Clean development preview folder
 *
 */
// eslint-disable-next-line no-unused-vars
function cleanPreview ( done ) {
	del.sync(previewDir);
	done();
}

/**
 * Clean distribution folder
 *
 */
function cleanDist ( done ) {
	del.sync(baseDir);
	done();
}

/**
 * Copy images to preview folder
 *
 */
function copyImagesPreview () {
	return gulp.src('src/**/*.+(png|jpg|jpeg|gif|svg|mp4)')
			// Caching images that ran through imagemin
			/* * /
			.pipe(cache(imagemin({
				interlaced: true
			})))
			/**/
			.pipe(gulp.dest(previewDir));
}

/**
 * Copy images to distribution folder
 *
 */
function copyImagesDist () {
	return gulp.src('src/images/**/*.+(png|jpg|jpeg|gif|svg|mp4)')
			// Caching images that ran through imagemin
			.pipe(cache(imagemin({
				interlaced: true
			})))
			.pipe(gulp.dest(baseDir));
}

/**
 * build tasks.
 * build complete HTML email template
 * compile sass (compileSass task) before running build
 * and reload serve
 */

function buildDevelop() {

	return gulp.src('src/index.html')
		//.pipe(template('src/emails/_index.html'))
		// replace `.scss` file paths from template with compiled file paths
		.pipe(replace(new RegExp('\/sass\/(.+)\.scss', 'ig'), '/css/$1.css'))
		.pipe(inlineCss({
			removeHtmlSelectors: false,
			applyStyleTags: true,
			removeLinkTags: true,
			removeStyleTags: false,
			preserveMediaQueries: true
		}))
		//.pipe(rewriteImagePath({path:"https://nissan-media.r.worldssl.net/mailer/" + remoteDir + '/dist/images' }))
		.pipe(htmlmin({
			minifyCSS: true,
			minifyURLs: true,
			collapseWhitespace: true,
			caseSensitive: true
		}))
		/*
		 * Add Custom Font
		 */
		.pipe(inject.before('</head>', '<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css?family=Ubuntu:400,700" rel="stylesheet" /><!--<![endif]-->\n'))
		/*
		 * Add responsive styles
		 */
		.pipe(inject.before('</head>', '<style><!-- inject:head:mcss --><!-- endinject --></style>\n'))
		.pipe(gulpinject(gulp.src([previewDir + '/style.responsive.css']), {
			starttag: '<!-- inject:head:mcss -->',
			transform: function(filepath, file) {
				return file.contents.toString();
			}
		}))
		.pipe(replace(/<!-- inject:head:mcss -->/g, function(match, p1) {
			// Replaces instances of "foo" with "oof"
			console.log(p1, match);
			if ( match ) {
				return '';
			}
		}))
		.pipe(replace(/<!-- endinject -->/g, function(match, p1) {
			// Replaces instances of "foo" with "oof"
			console.log(p1, match);
			if ( match ) {
				return '';
			}
		}))
		/*
		 * Add video styles
		 */
		.pipe(inject.before('</head>', '<style>@supports (-webkit-overflow-scrolling:touch) {table[class^=video-wrapper] {display: block !important;}table[class^=video-fallback] {display: none !important;}}</style>\n'))
		/*
		 * Add Outlook Darkmode styles
		 */
		.pipe(inject.before('</head>', '<style>[data-ogsc] .personalised-numberplate, [data-ogsc].personalised-numberplate{color: #000000 !important;}</style>\n'))
		/*
		 * Add Gmail iOS styles
		 */
		.pipe(inject.before('</head>', '<style>@media screen and (max-width: 375px) { u + .body .personalised-numberplate{position: relative !important;padding-top:120px !important;font-size: 16px !important;height:100px!important; }}</style>\n'))
		/*
		 * Add Gmail Android styles
		 */
		.pipe(inject.before('</head>', '<style>@media screen and (max-width: 375px) { div > u + .body .personalised-numberplate{position: relative !important;padding-top: 0!important;font-size: 26px !important;line-height:185px !important;height:120px!important; }}</style>\n'))
		.pipe(rename('index.html'))
        .pipe(gulp.dest(previewDir));

}
function buildProd() {

	return gulp
        // import all email template (name ending with .template.pug) files from src/emails folder
        //.src('src/emails/**/*.template.pug')
        .src('src/index.html')
        //.pipe(template('src/emails/_index.html'))
        // replace `.scss` file paths from template with compiled file paths
        .pipe(replace(new RegExp('\/sass\/(.+)\.scss', 'ig'), '/css/$1.css'))
		.pipe(inlineCss({
			removeHtmlSelectors: false,
			applyStyleTags: true,
			removeLinkTags: true,
			removeStyleTags: false,
			preserveMediaQueries: true
		}))
        // do not generate sub-folders inside dist folder
		.pipe(rename({dirname: ''}))
		// rewrite asset paths
		//.pipe(rewriteImagePath({path: 'https://nissan-media.r.worldssl.net/mailer/' + remoteDir }))
		.pipe(rewriteImagePath({path: 'https://nissan-media.co.za/mailer/' + remoteDir }))
		//All other clients get the webfont reference; some will render the font and others will silently fail to the fallbacks.
		// put compiled HTML email templates inside dist folder
		.pipe(htmlmin({
			//minifyCSS: true,
			minifyURLs: true,
			collapseInlineTagWhitespace: true,
			collapseWhitespace: true,
			caseSensitive: true
		}))
		/*
		 * Add Custom Font
		 */
		.pipe(inject.before('</head>', '<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css?family=Ubuntu:400,700" rel="stylesheet" /><!--<![endif]-->\n'))
		/*
		 * Add responsive styles
		 */
		.pipe(inject.before('</head>', '<style><!-- inject:head:mcss --><!-- endinject --></style>\n'))
		.pipe(gulpinject(gulp.src([previewDir + '/style.responsive.css']), {
			starttag: '<!-- inject:head:mcss -->',
			transform: function(filepath, file) {
				return file.contents.toString();
			}
		}))
		.pipe(replace(/<!-- inject:head:mcss -->/g, function(match, p1) {
			// Replaces instances of "foo" with "oof"
			console.log(p1, match);
			if ( match ) {
				return '';
			}
		}))
		.pipe(replace(/<!-- endinject -->/g, function(match, p1) {
			// Replaces instances of "foo" with "oof"
			console.log(p1, match);
			if ( match ) {
				return '';
			}
		}))
		/*
		 * Add video styles
		 */
		.pipe(inject.before('</head>', '<style>@supports (-webkit-overflow-scrolling:touch) {table[class^=video-wrapper] {display: block !important;}table[class^=video-fallback] {display: none !important;}}</style>\n'))
		/*
		 * Add Outlook Darkmode styles
		 */
		.pipe(inject.before('</head>', '<style>[data-ogsc] .personalised-numberplate, [data-ogsc].personalised-numberplate{color: #000000 !important;}</style>\n'))
		/*
		 * Add Gmail iOS styles
		 */
		.pipe(inject.before('</head>', '<style>@media screen and (max-width: 375px) { u + .body .personalised-numberplate{position: relative !important;padding-top:120px !important;font-size: 16px !important;height:100px!important; }}</style>\n'))
		/*
		 * Add Gmail Android styles
		 */
		.pipe(inject.before('</head>', '<style>@media screen and (max-width: 375px) { div > u + .body .personalised-numberplate{position: relative !important;padding-top: 0!important;font-size: 26px !important;line-height:185px !important;height:120px!important; }}</style>\n'))
		.pipe(rename('index.html'))
        .pipe(gulp.dest(baseDir));

}

/**
 * task to reload browserSync
 */
function reloadBrowserSync( done ) {
	browserSync.reload();
	done();
}

function watchComponents () {

	return gulp.watch([
		'src/*.html',
		'src/**/*.scss',
		'src/**/*.+(png|jpg|jpeg|gif|svg|mp4)'
	])
	.on('change', gulp.series([
		sassCompile,
		mediaQueries,
		buildDevelop,
		reloadBrowserSync]));
}

/**
 * Deploy distribution folder to CDN.
 * Copies the new files to the server
 *
 * Usage: `FTP_USER=someuser FTP_PWD=somepwd gulp ftp-deploy`
 *
 */
function getFtpConnection() {
	return ftp.create({
		host: process.env.FTP_SERVER,
		port: process.env.FTP_PORT,
		user: process.env.FTP_USER,
		password: process.env.FTP_PWD,
		parallel: 5,
		log: gutil.log
	});
}

function ftpDeploy() {
	var conn = getFtpConnection();

	return gulp
		.src(
			['src/**/*.+(png|jpg|jpeg|gif|svg|mp4)'],
			{
				//base: '.', //keep src as base path in remote dir
				buffer: false
			}
		)
		.pipe(conn.newer(remoteDir)) // only upload newer files
		.pipe(conn.dest(remoteDir));
}

/**
 * Include HTML Prevew link tag for Nissan ACM
 * Replace Salutation with Nissan ACM Tag
 * Replace Unsubscribe with Nissan ACM Tag
 */
function tagACM() {

	return gulp
		.src('src/emails/tags/_tags_acm.html')
        .pipe(template('dist/index.html'))
        // do not generate sub-folders inside dist folder
		.pipe(rename({dirname: ''}))
		//.pipe(replace('Dear (Customer Name),', function(match) {
		.pipe(replace(/(Dear\s)(\(*)([Vv]alued\s[Cc]ustomer|[Cc]ustomer+)(\s|\w*)(\)*)/g, function(match, p1) {
			console.log(match, p1);
			return 'Dear <% if ( recipient.lastName == "" ) { %>Valued Customer,<% }else{ %><% if ( recipient.salutation == "" ) { %>Valued Customer,<% }else{ %><%= recipient.salutation %> <%= recipient.lastName %>,<% } %><% } %>';
		}))
		.pipe(rename('index.html'))
		.pipe(gulp.dest(baseDir));

}

/**
 * Add Oracle EmailOpen event tag
 * URLencode hrefs and reformat for Oracle
 *
 */
function tagOracleWork() {

	return gulp
        // import all email template (name ending with .template.pug) files from src/emails folder
		.src('./dist/index.html')
		.pipe(replace(/<a href="(.*?)"/g, function(match, p1) {
			// Replaces instances of "foo" with "oof"
			//console.log(p1);
			if ( p1 === '#' ) {
				return '<a href="' + encodeURIComponent(p1) + '"';
			} else {
				return '<a href="https://stags.bluekai.com/site/' + process.env.OracleID + '?phint=event%3Demail_click&phint=email_name%3D' + process.env.OracleCampaignName + '&phint=action%3DPLEASEREPLACEME&done=' + encodeURIComponent(p1) + '"';
			}

		}))
		.pipe(inject.before('</body>', '<img alt="" height="1" width="1" border="0" src="https://stags.bluekai.com/site/' + process.env.OracleID + '?phint=event%3Demail_click&phint=email_name%3D' + process.env.OracleCampaignName + '" />'))
		.pipe(inject.before('</body>', '<img alt="" height="1" width="1" border="0" src="https://stags.bluekai.com/site/' + process.env.OracleID + '?phint=event%3Demail_open&phint=email_name%3D' + process.env.OracleCampaignName + '" />'))
        // put compiled HTML email templates inside dist folder
		.pipe(rename('index-compiled-oracle-tagged.html'))
        .pipe(gulp.dest(baseDir));

}

/**
 * Testemail task.
 * Send a test email for UAT.
 *
 */
async function uatEmail() {
	// Generate test SMTP service account from ethereal.email
	// Only needed if you don't have a real mail account for testing
	//let testAccount = await nodemailer.createTestAccount();

	// create reusable transporter object using the default SMTP transport
	let transporter = nodemailer.createTransport({
		host: 'mail.tbwa-cdn.co.za',
		port: 465,
		secure: true, // true for 465, false for other ports
		auth: {
			user: 'gitlab@tbwa-cdn.co.za', 	// generated ethereal user
			pass: 'fgeF&3APf?pf' 			// generated ethereal password
		}
	});

	// send mail with defined transport object
	let info = await transporter.sendMail({
	//let info = transporter.sendMail({
		from: '"TBWA MAILER TEST 👻" <gitlab@tbwa-cdn.co.za>', 	// sender address
		to: 'mailertest@tbwa-cdn.co.za', //'max.sibande@tbwa.co.za, sibusiso@5ivedesign.co.za', 	// list of receivers
		subject: 'TBWA EMAIL TEST - ' + process.env.Brand.toUpperCase() + ' ' + process.env.Jobnumber + ' - ' + process.env.EmailSubject, // Subject line
		text: '', // plain text body
		html: fs.readFileSync( path.join(__dirname, 'dist/index.html'), 'utf8')
	});

	console.log('Message sent: %s', info.messageId);
	//done();
	// Preview only available when sending through an Ethereal account
	//console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

}

async function testEmail( email ) {
	// Generate test SMTP service account from ethereal.email
	// Only needed if you don't have a real mail account for testing
	//let testAccount = await nodemailer.createTestAccount();

	// create reusable transporter object using the default SMTP transport
	let transporter = nodemailer.createTransport({
		host: 'mail.tbwa-cdn.co.za',
		port: 465,
		secure: true, // true for 465, false for other ports
		auth: {
			user: 'gitlab@tbwa-cdn.co.za', 	// generated ethereal user
			pass: 'fgeF&3APf?pf' 			// generated ethereal password
		}
	});

	// send mail with defined transport object
	let info = await transporter.sendMail({
	//let info = transporter.sendMail({
		from: '"TBWA MAILER TEST 👻" <gitlab@tbwa-cdn.co.za>', 	// sender address
		to: email, //'max.sibande@tbwa.co.za, sibusiso@5ivedesign.co.za', 	// list of receivers
		subject: 'TBWA EMAIL TEST - ' + process.env.Brand.toUpperCase() + ' ' + process.env.Jobnumber + ' - ' + process.env.EmailSubject, // Subject line
		text: '', // plain text body
		html: fs.readFileSync( path.join(__dirname, 'dist/index.html'), 'utf8')
	});

	console.log('Message sent: %s', info.messageId);
	//done();
	// Preview only available when sending through an Ethereal account
	//console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

}

/*
 * COMMON BUILD STEPS
 */
let mediaQueries = gulp.series(
	groupMediaQueries,
	createMediaQueriesFile
	//extractMediaQueries
	);

let prebuildCommon = gulp.series(
	sassCompile,
	mediaQueries
);

/*
 * DEVELOPMENT BUILD STEPS
 */
let prebuildDev = gulp.series(
	cleanPreview,
	copyImagesPreview,
	prebuildCommon
);

/*
 * PRODUCTION BUILD STEPS
 */
let prebuildProd = gulp.series(
	cleanDist,
	//copyImagesDist,
	prebuildCommon
);

/*
 * BUILD CODEBASE BASED ON NODE_ENV and SELECTED USER INPUT
 */
let buildcodebase = gulp.series(
	( NEW_ENV.buildType == 'production') ? prebuildProd : prebuildDev,
	// eslint-disable-next-line consistent-return
	function (cb) {

		if ( process.env.NODE_ENV === 'DEVOPS' ) {

			return buildProd();

		} else {

			//console.log('buildType:', NEW_ENV.buildType);
			// body omitted
			switch (NEW_ENV.buildType) {
				case 'production':

					return buildProd();

				case 'development':

					return buildDevelop();
			}
		}

		cb();
});

/*
 * CI BUILD STEPS (PRODUCTION)
 */
let buildCI = gulp.series(
	cleanDist,
	//copyImagesDist,
	prebuildCommon,
	buildProd,
	function (cb) {
		cb();
	}
);

let watchbuild = gulp.series(
		//watchImages,
		watchComponents,
		//sassWatch,
		function(cb) {
			cb();
		}
);

/**
 * browserSync task to launch preview server
 */
let server = gulp.series(
	function(cb) {
		browserSync.init({
			port: 8181,
			//reloadDelay: 2000, // reload after 2s, compilation is finished (hopefully)
			server: {
				baseDir: ( process.env.NODE_ENV == 'development' ) ? previewDir : baseDir
			}
		});
		cb();
	}
);


/*
 * Prompts task.
 * Preview the HTML mailer on your web browser
 *
 */

function promptUpdateJob () {

	return inquirer
	.prompt([
		{
			type: 'input',
			name: 'Name',
			message: 'Mailer name (max length: 48 characters):',
			validate: function(res){
				//console.log(' validate New Line 1:', res, res.length);
				if (res.length > 48 ){
					gutil.log( gutil.colors.red('Validation Error:: Mailer name exceeds 48 character rule by ' + (res.length - 48) + ' characters.'));
					return false;
				} else {
					return true;
				}
			}
		},
		{
			type: 'input',
			name: 'Jobnumber',
			message: 'Job number (length: 6 - 10 characters):',
			validate: function(res){
				//console.log(' validate New Line 1:', res, res.length);
				if (res.length > 10 || res.length < 6 ){
					gutil.log( gutil.colors.red('Job number Validation Error.'));
					return false;
				} else {
					return true;
				}
			}
		},
		{
			type: 'input',
			name: 'CampaignType',
			message: 'Campaign type (max length: 80 characters):',
			validate: function(res){
				//console.log(' validate New Line 1:', res, res.length);
				if (res.length > 140 ){
					gutil.log( gutil.colors.red('Validation Error:: Campaign type exceeds 80 character rule by ' + (res.length - 80) + ' characters.'));
					return false;
				} else {
					return true;
				}
			}
		},
		{
			type: 'input',
			name: 'CampaignName',
			message: 'Campaign name (max length: 160 characters):',
			validate: function(res){
				//console.log(' validate New Line 1:', res, res.length);
				if (res.length > 140 ){
					gutil.log( gutil.colors.red('Validation Error:: Campaign name exceeds 160 character rule by ' + (res.length - 160) + ' characters.'));
					return false;
				} else {
					return true;
				}
			}
		}
	])
	.then( answers => {
		// Use user feedback for... whatever!!
		gutil.log( gutil.colors.green( 'updating ENVs::'), answers );

		NEW_ENV = answers;

		return updateEnvFileJob();

	})
	.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});
}

function promptUpdateSocialicons () {

	return inquirer
	.prompt([
		/** /
		{
			type: 'list',
			name: 'socialIconsShape',
			message: 'Social icons shape:',
			choices: [ 'Square', 'Round' ],
			validate: function(res){
				console.log( 'socialIconsShape validate:', res );
				if (!res){
					gutil.log( gutil.colors.red('socialIconsShape Validation Error::'));
					return false;
				} else {
					return true;
				}
			}
		},
		/**/
		{
			type: 'list',
			name: 'socialIconsBGColour',
			message: 'Icon background colour:',
			choices: [ 'Black', 'White' ],
			validate: function(res){
				console.log( 'socialIconsBGColour validate:', res );
				if (!res){
					gutil.log( gutil.colors.red('socialIconsBGColour Validation Error::'));
					return false;
				} else {
					return true;
				}
			}
		},
		{
			type: 'list',
			name: 'socialIconsColour',
			message: 'Icon colour:',
			choices: [ 'Black', 'White', 'Red', 'Transparent' ],
			validate: function(res){
				console.log( 'socialIconsColour validate:', res );
				if (!res){
					gutil.log( gutil.colors.red('socialIconsColour Validation Error::'));
					return false;
				} else {
					return true;
				}
			}
		}

	])
	.then( answers => {
		// Use user feedback for... whatever!!
		gutil.log( gutil.colors.green( 'updating promptUpdateSocialicons ENVs::'), answers );

		NEW_ENV = answers;

		return updateTemplateThemeSocialIcons(); //updateTemplateTheme

	})
	.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});
}

function promptUpdateEmailCopy () {

	return inquirer
	.prompt([
		{
			type: 'input',
			name: 'EmailSubject',
			message: 'Mailer Subject (max length: 160 characters):',
			validate: function(res){
				//console.log(' validate New Line 1:', res, res.length);
				if (res.length > 140 ){
					gutil.log( gutil.colors.red('Validation Error:: Mailer subject exceeds 160 character rule by ' + (res.length - 160) + ' characters.'));
					return false;
				} else {
					return true;
				}
			}
		}
	])
	.then( answers => {
		// Use user feedback for... whatever!!
		gutil.log( gutil.colors.green( 'updating EmailSubject::'), answers );

		NEW_ENV = answers;

		return updateEnvFileEmailSubject();

	})
	.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});
}

function promptBuild () {

	if ( process.env.NODE_ENV === 'DEVOPS' ) {

		return buildcodebase();

	} else {

		return inquirer
		.prompt([
			{
				type: 'list',
				name: 'buildType',
				choices: [ 'development', 'production' ],
				message: 'Which build would you like?',
				validate: function(res){
					console.log( 'buildType validate:', res );
					if (!res){
						gutil.log( gutil.colors.red('buildType Validation Error::'));
						return false;
					} else {
						return true;
					}
				}
			}
		])
		.then( answers => {
			// Use user feedback for... whatever!!


			NEW_ENV = answers;

			switch (answers.buildType) {
				case 'production':

					gutil.log( gutil.colors.green( 'buildType::'), answers.buildType );

					break;

				case 'development':

					gutil.log( gutil.colors.green( 'buildType::'), answers.buildType );

					break;

			}

		})
		.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});

	}
}

function promptUpdate () {

	return inquirer
	.prompt([
		{
			type: 'list',
			name: 'updateType',
			choices: ['Job', 'Emailsubject' ],
			message: 'Customize the mailer look and feel:',
			validate: function(res){
				console.log( 'updateType validate:', res );
				if (!res){
					gutil.log( gutil.colors.red('updateType Validation Error::'));
					return false;
				} else {
					return true;
				}
			}
		}
	])
	// eslint-disable-next-line consistent-return
	.then( answers => {
		// Use user feedback for... whatever!!
		gutil.log( gutil.colors.green( 'updateType::'), answers );

		NEW_ENV = answers;

		switch (answers.updateType) {
			case 'Job':

				return promptUpdateJob();

			case 'Social Icons':

				return promptUpdateSocialicons();

			case 'Emailsubject':

				return promptUpdateEmailCopy();
		}

	})
	.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});
}

function promptTag () {

	return inquirer
	.prompt([
		{
			type: 'list',
			name: 'tagType',
			choices: [ 'Oracle' ],
			message: 'Which tagging build would you like to run?',
			validate: function(res){
				console.log( 'tagType validate:', res );
				if (!res){
					gutil.log( gutil.colors.red('tagType Validation Error::'));
					return false;
				} else {
					return true;
				}
			}
		}
	])
	// eslint-disable-next-line consistent-return
	.then( answers => {
		// Use user feedback for... whatever!!
		gutil.log( gutil.colors.green( 'tagType::'), answers );

		NEW_ENV = answers;

		switch (answers.tagType) {
			case 'ACM':

				return tagACM();

			case 'Oracle':

				return tagOracleWork();
		}

	})
	.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});
}

function promptEmailInput () {

	let inputPrompts = [];

	switch (NEW_ENV.emailtestType) {

		case 'UAT':

			inputPrompts.push(
				{
					type: 'input',
					name: 'email',
					message: 'You\'re about to send an email for QA Testing. Press enter to continue.',
					validate: function(res){
						//console.log(' validate New Line 1:', res, res.length);
						if (res.length > 48 ){
							gutil.log( gutil.colors.red('Validation Error:: E-Mail rule broken.'));
							return false;
						} else {
							return true;
						}
					}
				}
			);

			break;

		case 'Preview':

			inputPrompts.push(
				{
					type: 'input',
					name: 'email',
					message: 'You\'re about to preview the email. Press enter to continue.',
					validate: function(res){
						//console.log(' validate New Line 1:', res, res.length);
						if (res.length > 48 ){
							gutil.log( gutil.colors.red('Validation Error:: E-Mail rule broken.'));
							return false;
						} else {
							return true;
						}
					}
				}
			);

			break;

		case 'Development':

			inputPrompts.push(
				{
					type: 'input',
					name: 'email',
					message: 'E-Mail address:',
					validate: function(res){
						//console.log(' validate New Line 1:', res, res.length);
						if (res.length > 48 ){
							gutil.log( gutil.colors.red('Validation Error:: E-Mail rule broken.'));
							return false;
						} else {
							return true;
						}
					}
				}
			);

			break;
	}

	return inquirer
	.prompt(inputPrompts)
	// eslint-disable-next-line consistent-return
	.then( answers => {
		// Use user feedback for... whatever!!

		//NEW_ENV = answers;
		switch (NEW_ENV.emailtestType) {

			case 'UAT':

				gutil.log( gutil.colors.green( 'sending UAT Email[' + NEW_ENV.emailtestType + ']::'), answers );

				return uatEmail();

			case 'Preview':

				gutil.log( gutil.colors.green( 'Previewing email[' + NEW_ENV.emailtestType + ']::'), answers );

				return previewMail();

			case 'Development':

				gutil.log( gutil.colors.green( 'sending test email[' + NEW_ENV.emailtestType + ']::'), answers );

				return testEmail(answers.email);
		}

	})
	.catch(error => {
		if (error.isTtyError) {
		// Prompt couldn't be rendered in the current environment
		} else {
		// Something else when wrong
		}
	});
}

function promptTestemail () {

	return inquirer
	.prompt([
		{
			type: 'list',
			name: 'emailtestType',
			choices: [ 'Development', 'UAT' ],
			message: 'What type of email would you like to send?',
			validate: function(res){
				console.log( 'emailtestType validate:', res );
				if (!res){
					gutil.log( gutil.colors.red('emailtestType Validation Error::'));
					return false;
				} else {
					return true;
				}
			}
		}
	])
	.then( answers => {
		// Use user feedback for... whatever!!
		gutil.log( gutil.colors.green( 'emailtestType::'), answers );

		NEW_ENV = answers;

		/** /
		switch (answers.updateType) {
			case 'UAT':

				return uatEmail();

			case 'Development':

				return promptEmailInput();
		}
		/**/

	})
	.catch(error => {
		if (error.isTtyError) {
			// Prompt couldn't be rendered in the current environment
		} else {
			// Something else when wrong
		}
	});
}

/**/
exports.start = gulp.series( prebuildDev, buildDevelop, server, watchbuild );

exports.build = gulp.series(
	promptBuild,
	buildcodebase );

exports.update = gulp.series( promptUpdate );

exports.tag = gulp.series(
	buildCI,
	promptTag );

exports.test = gulp.series(
	buildCI,
	ftpDeploy,
	promptTestemail,
	promptEmailInput );

exports.deploy = gulp.series(
	ftpDeploy
);

exports.CI = gulp.series(
	buildCI );
