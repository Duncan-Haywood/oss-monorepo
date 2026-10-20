import jwt


def read_claims(token):
    return jwt.decode(token, options={"verify_signature": False})
