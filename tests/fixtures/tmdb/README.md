# TMDB fixtures

These reduced fixtures preserve only fields needed by the adapter tests. They
follow the current official TMDB v3 movie search and movie details response
shapes; popularity and vote fields remain in the raw search fixture to verify
that the normalizer does not expose them.
