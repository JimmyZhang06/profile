#!/bin/sh
set -eu
/www/server/apache/bin/httpd -t
/www/server/apache/bin/apachectl graceful
