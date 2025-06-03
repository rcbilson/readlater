package main

import (
	"net/http"
)

type User string
type AuthHandlerFunc func(http.ResponseWriter, *http.Request, User)

func noAuth() func(AuthHandlerFunc) http.HandlerFunc {
	return func(next AuthHandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			next(w, r, "")
		}
	}
}
