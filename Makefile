all: index.html client/interactive.min.js client/interactive.min.js dist/ebisu.min.js dist/ebisu.min.es6.js

index.html: client/head.html client/foot.html README.md
	cp client/head.html index.html
	pandoc -f markdown_github-hard_line_breaks -t html5 README.md >> index.html
	cat client/foot.html >> index.html

client/interactive.js: interactive.js
	node_modules/.bin/browserify interactive.js -o client/interactive.js

client/interactive.min.js: client/interactive.js
	node_modules/.bin/google-closure-compiler-js --createSourceMap true client/interactive.js > client/interactive.min.js

dist/ebisu.js: index.js logsumexp.js
	node_modules/.bin/browserify -s ebisu index.js -o dist/ebisu.js

dist/ebisu.min.js: dist/ebisu.js
	node_modules/.bin/google-closure-compiler-js --createSourceMap true dist/ebisu.js > dist/ebisu.min.js

dist/ebisu.min.es6.js: dist/ebisu.js
	node_modules/.bin/google-closure-compiler-js --createSourceMap true --languageOut ES6 dist/ebisu.js > dist/ebisu.min.es6.js

min: client/interactive.min.js dist/ebisu.min.js dist/ebisu.min.es6.js

client/choo.js:
	node_modules/.bin/browserify

watch:
	fswatch -0 -o -l .1 *js client/* README.md | xargs -0 -n 1 -I {} make
